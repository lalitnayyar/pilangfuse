const form = document.querySelector('#research-form');
const topicInput = document.querySelector('#topic');
const timeline = document.querySelector('#timeline');
const result = document.querySelector('#result');
const statusBadge = document.querySelector('#status-badge');
const jobMeta = document.querySelector('#job-meta');

let currentJobId = null;
let eventSource = null;

function setStatus(status) {
  statusBadge.textContent = status;
  statusBadge.className = `badge ${status.toLowerCase()}`;
}

function resetView() {
  timeline.classList.remove('empty');
  timeline.innerHTML = '';
  result.className = 'result empty-state';
  result.innerHTML = '⏳ Waiting for agent output...';
  jobMeta.classList.add('hidden');
  jobMeta.innerHTML = '';
}

function addEventCard(event) {
  const card = document.createElement('article');
  card.className = `event-card ${event.status}`;
  card.innerHTML = `
    <div class="event-top">
      <div class="event-agent">${event.emoji} ${event.agent}</div>
      <div class="event-status">${event.status}</div>
    </div>
    <h3>${event.title}</h3>
    <p>${event.detail || ''}</p>
    <time>${new Date(event.timestamp).toLocaleTimeString()}</time>
  `;
  timeline.prepend(card);
}

function renderResult(job) {
  if (!job.result) return;

  const { topic, webResults, youtubeResults, report } = job.result;
  result.className = 'result';

  const webHtml = webResults.map(item => `
    <li>
      <a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a>
      <span>${item.brief}</span>
    </li>
  `).join('');

  const videoHtml = youtubeResults.map(item => `
    <li>
      <a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a>
      <span>${item.channel}</span>
    </li>
  `).join('');

  result.innerHTML = `
    <div class="result-header">
      <div>
        <p class="eyebrow">📚 Shareable research brief</p>
        <h3>${topic}</h3>
      </div>
      <a class="download-btn" href="${report.reportUrl}" target="_blank" rel="noreferrer">📝 Open Markdown</a>
    </div>
    <div class="columns">
      <div>
        <h4>🌐 Web Resources</h4>
        <ul>${webHtml}</ul>
      </div>
      <div>
        <h4>🎥 YouTube Videos</h4>
        <ul>${videoHtml}</ul>
      </div>
    </div>
    <p class="file-path">Saved at: ${report.filePath}</p>
  `;
}

async function refreshJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await response.json();

  setStatus(job.status);
  jobMeta.classList.remove('hidden');
  jobMeta.innerHTML = `🆔 Job: <strong>${job.id}</strong> · 🕒 Updated: <strong>${new Date(job.updatedAt).toLocaleTimeString()}</strong>`;

  if (job.status === 'completed') {
    renderResult(job);
    if (eventSource) eventSource.close();
  }

  if (job.status === 'failed') {
    result.className = 'result error-box';
    result.innerHTML = `❌ <strong>Workflow failed</strong><p>${job.error?.message || 'Unknown error'}</p>`;
    if (eventSource) eventSource.close();
  }
}

function connectEvents(jobId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/jobs/${jobId}/events`);

  eventSource.onmessage = async (message) => {
    const event = JSON.parse(message.data);
    addEventCard(event);
    await refreshJob(jobId);
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  resetView();
  setStatus('running');

  const topic = topicInput.value.trim();
  if (!topic) return;

  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });

  const data = await response.json();
  currentJobId = data.jobId;
  connectEvents(currentJobId);
  await refreshJob(currentJobId);
});
