const form = document.querySelector("#research-form");
const topicInput = document.querySelector("#topic");
const timeline = document.querySelector("#timeline");
const result = document.querySelector("#result");
const statusBadge = document.querySelector("#status-badge");
const jobMeta = document.querySelector("#job-meta");

const openSettingsButton = document.querySelector("#open-settings");
const closeSettingsButton = document.querySelector("#close-settings");
const cancelSettingsButton = document.querySelector("#cancel-settings");
const resetSettingsButton = document.querySelector("#reset-settings");
const copyVisibleSettingsButton = document.querySelector("#copy-visible-settings");
const testLangfuseButton = document.querySelector("#test-langfuse");
const downloadHealthDebugButton = document.querySelector("#download-health-debug");
const exportEnvButton = document.querySelector("#export-env");
const importEnvButton = document.querySelector("#import-env");
const importEnvFileInput = document.querySelector("#import-env-file");
const settingsSearchInput = document.querySelector("#settings-search");
const settingsModal = document.querySelector("#settings-modal");
const settingsForm = document.querySelector("#settings-form");
const settingsGroups = document.querySelector("#settings-groups");
const settingsFeedback = document.querySelector("#settings-feedback");
const deleteDockerImageButton = document.querySelector("#delete-docker-image");
const dockerImageRef = document.querySelector("#docker-image-ref");
const dockerImageSelect = document.querySelector("#docker-image-select");
const dockerDeleteTarget = document.querySelector("#docker-delete-target");
const refreshDockerImagesButton = document.querySelector("#refresh-docker-images");
const saveSettingsButton = document.querySelector("#save-settings");

let currentJobId = null;
let eventSource = null;
let settingsLoaded = false;
let latestSettings = [];
let dockerImages = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(status) {
  statusBadge.textContent = status;
  statusBadge.className = `badge ${status.toLowerCase()}`;
}

function resetView() {
  timeline.classList.remove("empty");
  timeline.innerHTML = "";
  result.className = "result empty-state";
  result.innerHTML = "⏳ Waiting for agent output...";
  jobMeta.classList.add("hidden");
  jobMeta.innerHTML = "";
}

function addEventCard(event) {
  const card = document.createElement("article");
  card.className = `event-card ${event.status}`;
  card.innerHTML = `
    <div class="event-top">
      <div class="event-agent">${event.emoji} ${escapeHtml(event.agent)}</div>
      <div class="event-status">${escapeHtml(event.status)}</div>
    </div>
    <h3>${escapeHtml(event.title)}</h3>
    <p>${escapeHtml(event.detail || "")}</p>
    <time>${new Date(event.timestamp).toLocaleTimeString()}</time>
  `;
  timeline.prepend(card);
}

function slugifyFilename(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "research-report";
}

function buildLocalMarkdownFilename(topic) {
  const now = new Date();
  const stamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `${slugifyFilename(topic)}-${stamp}.md`;
}

function renderResult(job) {
  if (!job.result) return;

  const { topic, webResults, youtubeResults, report } = job.result;
  result.className = "result";

  const webHtml = webResults.map((item) => `
    <li>
      <a href="${encodeURI(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
      <span>${escapeHtml(item.brief)}</span>
    </li>
  `).join("");

  const videoHtml = youtubeResults.map((item) => `
    <li>
      <a href="${encodeURI(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
      <span>${escapeHtml(item.channel)}</span>
    </li>
  `).join("");

  result.innerHTML = `
    <div class="result-header">
      <div>
        <p class="eyebrow">📚 Shareable research brief</p>
        <h3>${escapeHtml(topic)}</h3>
      </div>
      <div class="result-actions">
        <a class="download-btn" href="${encodeURI(report.reportUrl)}" target="_blank" rel="noreferrer">📝 Open Markdown</a>
        <button class="secondary-btn download-local-btn" type="button" data-topic="${escapeHtml(topic)}">⬇️ Download Local .md</button>
      </div>
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
    <p class="file-path">Saved at: ${escapeHtml(report.filePath)}</p>
  `;
}

async function parseJsonResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Request failed");
  }
  return data;
}

async function refreshJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await parseJsonResponse(response);

  setStatus(job.status);
  jobMeta.classList.remove("hidden");
  jobMeta.innerHTML = `🆔 Job: <strong>${escapeHtml(job.id)}</strong> · 🕒 Updated: <strong>${new Date(job.updatedAt).toLocaleTimeString()}</strong>`;

  if (job.status === "completed") {
    renderResult(job);
    if (eventSource) eventSource.close();
  }

  if (job.status === "failed") {
    result.className = "result error-box";
    result.innerHTML = `❌ <strong>Workflow failed</strong><p>${escapeHtml(job.error?.message || "Unknown error")}</p>`;
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

function setSettingsFeedback(message, tone = "info") {
  if (!message) {
    settingsFeedback.className = "feedback hidden";
    settingsFeedback.textContent = "";
    return;
  }

  settingsFeedback.className = `feedback ${tone}`;
  settingsFeedback.textContent = message;
}

function groupSettings(settings) {
  return settings.reduce((groups, setting) => {
    groups[setting.group] ||= [];
    groups[setting.group].push(setting);
    return groups;
  }, {});
}

function buildSettingSearchText(setting) {
  return [setting.name, setting.label, setting.group, setting.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applySettingsFilter() {
  const searchTerm = settingsSearchInput.value.trim().toLowerCase();
  const cards = settingsGroups.querySelectorAll(".setting-card");

  cards.forEach((card) => {
    const matches = !searchTerm || card.dataset.settingSearch.includes(searchTerm);
    card.classList.toggle("hidden", !matches);
  });

  settingsGroups.querySelectorAll(".settings-section").forEach((section) => {
    const visibleCards = section.querySelectorAll(".setting-card:not(.hidden)").length;
    section.classList.toggle("hidden", visibleCards === 0);
  });
}

function renderSettingControl(setting) {
  const inputId = `setting-${setting.name}`;
  const value = setting.value ?? "";

  if (setting.type === "select") {
    const options = setting.options.map((option) => `
      <option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>
    `).join("");

    return `
      <select id="${inputId}" name="${setting.name}">
        ${options}
      </select>
    `;
  }

  if (setting.type === "boolean") {
    return `
      <select id="${inputId}" name="${setting.name}">
        <option value="true" ${value === "true" ? "selected" : ""}>true</option>
        <option value="false" ${value === "false" ? "selected" : ""}>false</option>
      </select>
    `;
  }

  const inputType = setting.secret ? "password" : setting.type === "number" ? "number" : "text";
  const extraAttributes = setting.type === "number" ? ' inputmode="numeric" min="0" step="1"' : ' autocomplete="off"';
  const inputHtml = `<input id="${inputId}" name="${setting.name}" type="${inputType}" value="${escapeHtml(value)}"${extraAttributes} />`;

  if (!setting.secret) {
    return `
      <div class="setting-input-row">
        ${inputHtml}
        <button type="button" class="copy-setting secondary-btn" data-target="${inputId}">Copy</button>
      </div>
    `;
  }

  return `
    <div class="secret-input">
      ${inputHtml}
      <button type="button" class="secret-toggle" data-target="${inputId}" aria-pressed="false">Show</button>
      <button type="button" class="copy-setting secondary-btn" data-target="${inputId}">Copy</button>
    </div>
  `;
}

function renderSettings(settings) {
  latestSettings = settings;
  const groups = groupSettings(settings);

  settingsGroups.innerHTML = Object.entries(groups).map(([groupName, groupSettingsList]) => `
    <section class="settings-section" data-group-name="${escapeHtml(groupName.toLowerCase())}">
      <h3>${escapeHtml(groupName)}</h3>
      <div class="settings-grid">
        ${groupSettingsList.map((setting) => `
          <label class="setting-card" for="setting-${setting.name}" data-setting-search="${escapeHtml(buildSettingSearchText(setting))}">
            <div class="setting-card-head">
              <div>
                <div class="setting-name">${escapeHtml(setting.name)}</div>
                <div class="setting-label">${escapeHtml(setting.label)}</div>
              </div>
              ${setting.secret ? '<span class="secret-pill">masked</span>' : ""}
            </div>
            <div class="setting-control">${renderSettingControl(setting)}</div>
            <p class="setting-help">${escapeHtml(setting.description || "")}</p>
          </label>
        `).join("")}
      </div>
    </section>
  `).join("");

  refreshDockerImagePreview();
  applySettingsFilter();
}

function getFormValue(name) {
  return settingsForm.querySelector(`[name="${name}"]`)?.value ?? "";
}

function getDockerFormValues() {
  const imageName = getFormValue("DOCKER_IMAGE_NAME").trim();
  const imageTag = getFormValue("DOCKER_IMAGE_TAG").trim() || "latest";

  return {
    imageName,
    imageTag,
    imageRef: imageName ? `${imageName}:${imageTag}` : "Not configured",
  };
}

function getSelectedDockerImage() {
  const imageId = dockerImageSelect.value;
  if (!imageId) return null;
  return dockerImages.find((image) => image.imageId === imageId) || null;
}

function refreshDockerImagePreview() {
  const { imageName, imageRef } = getDockerFormValues();
  const selectedImage = getSelectedDockerImage();
  const deleteTarget = selectedImage?.displayName || imageRef;

  dockerImageRef.textContent = imageRef;
  dockerDeleteTarget.textContent = deleteTarget;
  deleteDockerImageButton.disabled = !selectedImage && !imageName;
}

function renderDockerImages() {
  const currentValue = dockerImageSelect.value;
  const optionHtml = dockerImages.map((image) => {
    const meta = [image.createdSince, image.size].filter(Boolean).join(" · ");
    const label = meta ? `${image.displayName} — ${meta}` : image.displayName;
    return `<option value="${escapeHtml(image.imageId)}">${escapeHtml(label)}</option>`;
  }).join("");

  dockerImageSelect.innerHTML = `
    <option value="">Configured image from form</option>
    ${optionHtml}
  `;

  if (dockerImages.some((image) => image.imageId === currentValue)) {
    dockerImageSelect.value = currentValue;
  } else {
    dockerImageSelect.value = "";
  }

  refreshDockerImagePreview();
}

async function loadDockerImages() {
  const response = await fetch("/api/docker/images");
  const data = await parseJsonResponse(response);
  dockerImages = data.images || [];
  renderDockerImages();
  return data;
}

async function loadSettings(forceReload = false) {
  if (settingsLoaded && !forceReload) return;

  setSettingsFeedback("Loading settings…", "info");

  const settingsData = await fetch("/api/settings").then(parseJsonResponse);
  renderSettings(settingsData.settings);
  settingsLoaded = true;

  try {
    await loadDockerImages();
    setSettingsFeedback("Keys are masked by default. Use Show/Hide, Copy, Search, Export, Import, or Reset as needed, then Save to update .env and live runtime values.", "info");
  } catch (error) {
    dockerImages = [];
    renderDockerImages();
    setSettingsFeedback(`Settings loaded, but Docker images could not be listed: ${error.message}`, "error");
  }
}

function openSettingsModal() {
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  loadSettings(true).catch((error) => {
    setSettingsFeedback(error.message, "error");
  });
}

function closeSettingsModal() {
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function serializeEnvValue(value) {
  const stringValue = String(value ?? "");
  if (!stringValue) return "";
  if (/^[A-Za-z0-9_./:@-]+$/.test(stringValue)) return stringValue;
  return JSON.stringify(stringValue);
}

function buildSettingsBlock({ visibleOnly = false } = {}) {
  const cards = [...settingsGroups.querySelectorAll(".setting-card")]
    .filter((card) => !visibleOnly || !card.classList.contains("hidden"));

  return cards.map((card) => {
    const input = card.querySelector("input, select, textarea");
    return `${input.name}=${serializeEnvValue(input.value ?? "")}`;
  }).join("\n");
}

function setFormValues(values) {
  for (const [name, value] of Object.entries(values)) {
    const input = settingsForm.querySelector(`[name="${name}"]`);
    if (!input) continue;
    input.value = value ?? "";
  }

  settingsForm.querySelectorAll('.secret-toggle[aria-pressed="true"]').forEach((button) => {
    const target = document.getElementById(button.dataset.target);
    if (target) {
      target.type = "password";
    }
    button.dataset.visible = "false";
    button.setAttribute("aria-pressed", "false");
    button.textContent = "Show";
  });

  refreshDockerImagePreview();
}

function loadDefaultValuesIntoForm() {
  const defaults = Object.fromEntries(latestSettings.map((setting) => [setting.name, setting.defaultValue ?? ""]));
  setFormValues(defaults);
}

async function handleSettingsUpdateResult(data, successMessage) {
  renderSettings(data.settings);
  settingsLoaded = true;

  let dockerWarning = "";

  try {
    await loadDockerImages();
  } catch (error) {
    dockerImages = [];
    renderDockerImages();
    dockerWarning = ` Docker images could not be listed: ${error.message}`;
  }

  if (data.restartRequired && data.nextPort) {
    setSettingsFeedback(`${successMessage}${dockerWarning} Switching app to port ${data.nextPort}…`, dockerWarning ? "warning" : "success");
    setTimeout(() => {
      window.location.href = `${window.location.protocol}//${window.location.hostname}:${data.nextPort}`;
    }, 1400);
  } else {
    setSettingsFeedback(`${successMessage}${dockerWarning}`, dockerWarning ? "warning" : "success");
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

result.addEventListener("click", async (event) => {
  const button = event.target.closest(".download-local-btn");
  if (!button) return;

  const topic = button.dataset.topic || "research-report";
  const jobId = currentJobId;
  if (!jobId) {
    result.innerHTML = `❌ <strong>Unable to download report</strong><p>No active job result is available.</p>`;
    return;
  }

  try {
    const response = await fetch(`/api/jobs/${jobId}`);
    const job = await parseJsonResponse(response);
    const markdown = job.result?.report?.markdown;

    if (!markdown) {
      throw new Error("Markdown content is not available for download.");
    }

    downloadTextFile(buildLocalMarkdownFilename(topic), `${markdown}\n`);
  } catch (error) {
    result.className = "result error-box";
    result.innerHTML = `❌ <strong>Unable to download report</strong><p>${escapeHtml(error.message)}</p>`;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetView();
  setStatus("running");

  const topic = topicInput.value.trim();
  if (!topic) return;

  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    const data = await parseJsonResponse(response);
    currentJobId = data.jobId;
    connectEvents(currentJobId);
    await refreshJob(currentJobId);
  } catch (error) {
    setStatus("failed");
    result.className = "result error-box";
    result.innerHTML = `❌ <strong>Unable to start workflow</strong><p>${escapeHtml(error.message)}</p>`;
  }
});

openSettingsButton.addEventListener("click", () => {
  openSettingsModal();
});

closeSettingsButton.addEventListener("click", () => {
  closeSettingsModal();
});

cancelSettingsButton.addEventListener("click", () => {
  closeSettingsModal();
});

resetSettingsButton.addEventListener("click", () => {
  if (!latestSettings.length) {
    setSettingsFeedback("Settings are still loading. Please wait a moment.", "error");
    return;
  }

  const confirmed = window.confirm("Load default values into the settings form? Click Save Settings afterward to persist them to .env.");
  if (!confirmed) return;

  loadDefaultValuesIntoForm();
  dockerImageSelect.value = "";
  refreshDockerImagePreview();
  setSettingsFeedback("Default values loaded into the form. Click Save Settings to apply them.", "info");
});

settingsSearchInput.addEventListener("input", () => {
  applySettingsFilter();
});

copyVisibleSettingsButton.addEventListener("click", async () => {
  try {
    const block = buildSettingsBlock({ visibleOnly: true });
    if (!block.trim()) {
      setSettingsFeedback("No visible settings matched the current filter.", "warning");
      return;
    }
    await navigator.clipboard.writeText(block);
    setSettingsFeedback("Visible settings copied as an env block.", "success");
  } catch (error) {
    setSettingsFeedback(`Unable to copy visible settings: ${error.message}`, "error");
  }
});

testLangfuseButton.addEventListener("click", async () => {
  testLangfuseButton.disabled = true;
  setSettingsFeedback("Testing Langfuse connection…", "info");

  try {
    const response = await fetch("/api/settings/langfuse/test", { method: "POST" });
    const data = await parseJsonResponse(response);
    setSettingsFeedback(`Langfuse connection OK. Base URL: ${data.debug?.baseUrl || "n/a"} · Tested at: ${new Date(data.testedAt).toLocaleTimeString()}`, "success");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    testLangfuseButton.disabled = false;
  }
});

downloadHealthDebugButton.addEventListener("click", async () => {
  downloadHealthDebugButton.disabled = true;
  setSettingsFeedback("Downloading health + Langfuse debug info…", "info");

  try {
    const response = await fetch("/api/health");
    const data = await parseJsonResponse(response);
    downloadTextFile(`pilangfuse-health-${new Date().toISOString().replaceAll(":", "-")}.json`, `${JSON.stringify(data, null, 2)}\n`);
    setSettingsFeedback("Health debug info downloaded.", "success");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    downloadHealthDebugButton.disabled = false;
  }
});

exportEnvButton.addEventListener("click", async () => {
  exportEnvButton.disabled = true;
  setSettingsFeedback("Exporting .env…", "info");

  try {
    const response = await fetch("/api/settings/export");
    const content = await response.text();

    if (!response.ok) {
      throw new Error(content || "Failed to export .env");
    }

    downloadTextFile(".env", content);
    setSettingsFeedback(".env exported successfully.", "success");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    exportEnvButton.disabled = false;
  }
});

importEnvButton.addEventListener("click", () => {
  importEnvFileInput.click();
});

importEnvFileInput.addEventListener("change", async () => {
  const [file] = importEnvFileInput.files || [];
  if (!file) return;

  const confirmed = window.confirm("Import this .env file and apply its values to the running app?");
  if (!confirmed) {
    importEnvFileInput.value = "";
    return;
  }

  importEnvButton.disabled = true;
  setSettingsFeedback(`Importing ${file.name}…`, "info");

  try {
    const content = await file.text();
    const response = await fetch("/api/settings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const data = await parseJsonResponse(response);
    await handleSettingsUpdateResult(data, ".env imported successfully.");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    importEnvButton.disabled = false;
    importEnvFileInput.value = "";
  }
});

refreshDockerImagesButton.addEventListener("click", async () => {
  refreshDockerImagesButton.disabled = true;
  setSettingsFeedback("Refreshing local Docker images…", "info");

  try {
    await loadDockerImages();
    setSettingsFeedback("Docker image list refreshed.", "success");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    refreshDockerImagesButton.disabled = false;
  }
});

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) {
    closeSettingsModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    closeSettingsModal();
  }
});

settingsForm.addEventListener("click", async (event) => {
  const toggleButton = event.target.closest(".secret-toggle");
  if (toggleButton) {
    const targetInput = document.getElementById(toggleButton.dataset.target);
    if (!targetInput) return;

    const visible = toggleButton.getAttribute("aria-pressed") === "true";
    targetInput.type = visible ? "password" : "text";
    toggleButton.setAttribute("aria-pressed", visible ? "false" : "true");
    toggleButton.textContent = visible ? "Show" : "Hide";
    return;
  }

  const copyButton = event.target.closest(".copy-setting");
  if (!copyButton) return;

  const targetInput = document.getElementById(copyButton.dataset.target);
  if (!targetInput) return;

  try {
    await navigator.clipboard.writeText(targetInput.value || "");
    setSettingsFeedback(`Copied ${targetInput.name} to clipboard.`, "success");
  } catch (error) {
    setSettingsFeedback(`Unable to copy ${targetInput.name}: ${error.message}`, "error");
  }
});

settingsForm.addEventListener("input", (event) => {
  if (["DOCKER_IMAGE_NAME", "DOCKER_IMAGE_TAG"].includes(event.target.name)) {
    refreshDockerImagePreview();
  }
});

dockerImageSelect.addEventListener("change", () => {
  refreshDockerImagePreview();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(settingsForm);
  const updates = Object.fromEntries(formData.entries());

  saveSettingsButton.disabled = true;
  resetSettingsButton.disabled = true;
  setSettingsFeedback("Saving settings…", "info");

  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: updates }),
    });

    const data = await parseJsonResponse(response);
    await handleSettingsUpdateResult(data, "Settings saved. .env updated and new values are now active.");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    saveSettingsButton.disabled = false;
    resetSettingsButton.disabled = false;
  }
});

deleteDockerImageButton.addEventListener("click", async () => {
  const selectedImage = getSelectedDockerImage();
  const { imageName, imageTag, imageRef } = getDockerFormValues();
  const deleteTarget = selectedImage?.displayName || imageRef;

  if (!selectedImage && !imageName) {
    setSettingsFeedback("Choose a local Docker image or set DOCKER_IMAGE_NAME before deleting.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete Docker image ${deleteTarget}? This cannot be undone.`);
  if (!confirmed) return;

  deleteDockerImageButton.disabled = true;
  refreshDockerImagesButton.disabled = true;
  setSettingsFeedback(`Deleting Docker image ${deleteTarget}…`, "info");

  try {
    const payload = selectedImage
      ? { imageId: selectedImage.imageId, force: true }
      : { imageName, imageTag, force: true };

    const response = await fetch("/api/docker/delete-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await parseJsonResponse(response);
    await loadDockerImages();
    dockerImageSelect.value = "";
    refreshDockerImagePreview();
    setSettingsFeedback(`Docker image deleted: ${data.deleteTarget}`, "success");
  } catch (error) {
    setSettingsFeedback(error.message, "error");
  } finally {
    refreshDockerImagesButton.disabled = false;
    refreshDockerImagePreview();
  }
});
