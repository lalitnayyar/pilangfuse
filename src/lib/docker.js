import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "./errors.js";

const execFileAsync = promisify(execFile);

function normalizeDockerError(error) {
  if (error.code === "ENOENT") {
    throw new AppError("Docker CLI is not available on this machine.", {
      code: "DOCKER_NOT_AVAILABLE",
      status: 500,
    });
  }
}

export function getDockerImageRef({ imageName = process.env.DOCKER_IMAGE_NAME || "", imageTag = process.env.DOCKER_IMAGE_TAG || "latest" } = {}) {
  const normalizedName = String(imageName || "").trim();
  const normalizedTag = String(imageTag || "").trim() || "latest";

  if (!normalizedName) {
    return "";
  }

  return `${normalizedName}:${normalizedTag}`;
}

export async function listDockerImages() {
  try {
    const { stdout } = await execFileAsync("docker", ["image", "ls", "--no-trunc", "--format", "{{json .}}"]);
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const images = lines.map((line) => {
      const parsed = JSON.parse(line);
      const imageName = parsed.Repository && parsed.Repository !== "<none>" ? parsed.Repository : "";
      const imageTag = parsed.Tag && parsed.Tag !== "<none>" ? parsed.Tag : "";
      const imageRef = imageName && imageTag ? `${imageName}:${imageTag}` : "";

      return {
        imageId: parsed.ID,
        imageName,
        imageTag,
        imageRef,
        displayName: imageRef || parsed.ID,
        repository: parsed.Repository,
        tag: parsed.Tag,
        createdSince: parsed.CreatedSince,
        size: parsed.Size,
        digest: parsed.Digest,
      };
    });

    images.sort((left, right) => left.displayName.localeCompare(right.displayName));
    return images;
  } catch (error) {
    normalizeDockerError(error);
    throw new AppError("Failed to list Docker images.", {
      code: "DOCKER_LIST_FAILED",
      status: 500,
      details: {
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
      },
    });
  }
}

export async function deleteDockerImage({ imageId = "", imageName = process.env.DOCKER_IMAGE_NAME || "", imageTag = process.env.DOCKER_IMAGE_TAG || "latest", force = true } = {}) {
  const normalizedImageId = String(imageId || "").trim();
  const imageRef = normalizedImageId ? "" : getDockerImageRef({ imageName, imageTag });
  const deleteTarget = normalizedImageId || imageRef;

  if (!deleteTarget) {
    throw new AppError("Set DOCKER_IMAGE_NAME or choose a local Docker image before deleting.", {
      code: "DOCKER_IMAGE_TARGET_REQUIRED",
      status: 400,
    });
  }

  try {
    await execFileAsync("docker", ["image", "inspect", deleteTarget]);
  } catch (error) {
    normalizeDockerError(error);
    throw new AppError(`Docker image not found: ${deleteTarget}`, {
      code: "DOCKER_IMAGE_NOT_FOUND",
      status: 404,
    });
  }

  try {
    const args = ["image", "rm"];
    if (force) {
      args.push("--force");
    }
    args.push(deleteTarget);

    const { stdout, stderr } = await execFileAsync("docker", args);
    return {
      imageId: normalizedImageId || null,
      imageRef: imageRef || null,
      deleteTarget,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    normalizeDockerError(error);
    throw new AppError(`Failed to delete Docker image: ${deleteTarget}`, {
      code: "DOCKER_DELETE_FAILED",
      status: 500,
      details: {
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
      },
    });
  }
}
