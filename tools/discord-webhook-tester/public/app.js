const allowedMentionOptions = {
  none: [],
  users: ["users"],
  roles: ["roles"],
  everyone: ["everyone"],
  users_roles: ["users", "roles"],
  users_roles_everyone: ["users", "roles", "everyone"],
};

const presets = {
  a: {
    content: "通知タイトル",
    embedTitle: "",
    embedDescription: "@here\n通知本文",
    embedFooterText: "",
    allowedMentions: "everyone",
  },
  b: {
    content: "通知タイトル\n\n通知本文\n\n@here",
    embedTitle: "",
    embedDescription: "",
    embedFooterText: "",
    allowedMentions: "everyone",
  },
  c: {
    content: "通知タイトル\n\n@here",
    embedTitle: "",
    embedDescription: "通知本文",
    embedFooterText: "",
    allowedMentions: "everyone",
  },
  d: {
    content: "@here",
    embedTitle: "通知タイトル",
    embedDescription: "通知本文",
    embedFooterText: "",
    allowedMentions: "everyone",
  },
};

const elements = {
  form: document.querySelector("#payloadForm"),
  webhookUrl: document.querySelector("#webhookUrl"),
  presetSelect: document.querySelector("#presetSelect"),
  allowedMentions: document.querySelector("#allowedMentions"),
  content: document.querySelector("#content"),
  embedTitle: document.querySelector("#embedTitle"),
  embedDescription: document.querySelector("#embedDescription"),
  embedFooterText: document.querySelector("#embedFooterText"),
  username: document.querySelector("#username"),
  avatarUrl: document.querySelector("#avatarUrl"),
  payloadPreview: document.querySelector("#payloadPreview"),
  responseStatus: document.querySelector("#responseStatus"),
  responseError: document.querySelector("#responseError"),
  responseBody: document.querySelector("#responseBody"),
  sendButton: document.querySelector("#sendButton"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  clearResponseButton: document.querySelector("#clearResponseButton"),
};

function optionalText(value) {
  return value.trim().length > 0 ? value : undefined;
}

function buildPayload() {
  const payload = {};
  const content = optionalText(elements.content.value);
  const embedTitle = optionalText(elements.embedTitle.value);
  const embedDescription = optionalText(elements.embedDescription.value);
  const embedFooterText = optionalText(elements.embedFooterText.value);
  const username = optionalText(elements.username.value);
  const avatarUrl = optionalText(elements.avatarUrl.value);

  if (content) {
    payload.content = content;
  }

  const embed = {};
  if (embedTitle) {
    embed.title = embedTitle;
  }
  if (embedDescription) {
    embed.description = embedDescription;
  }
  if (embedFooterText) {
    embed.footer = { text: embedFooterText };
  }
  if (Object.keys(embed).length > 0) {
    payload.embeds = [embed];
  }

  payload.allowed_mentions = {
    parse: allowedMentionOptions[elements.allowedMentions.value] || [],
  };

  if (username) {
    payload.username = username;
  }
  if (avatarUrl) {
    payload.avatar_url = avatarUrl;
  }

  return payload;
}

function refreshPayloadPreview() {
  elements.payloadPreview.textContent = JSON.stringify(buildPayload(), null, 2);
}

function applyPreset(presetKey) {
  if (presetKey === "custom") {
    return;
  }

  const preset = presets[presetKey];
  elements.content.value = preset.content;
  elements.embedTitle.value = preset.embedTitle;
  elements.embedDescription.value = preset.embedDescription;
  elements.embedFooterText.value = preset.embedFooterText;
  elements.allowedMentions.value = preset.allowedMentions;
  refreshPayloadPreview();
}

function clearResponse() {
  elements.responseStatus.textContent = "-";
  elements.responseError.textContent = "-";
  elements.responseBody.textContent = "";
}

function setResponse(result) {
  elements.responseStatus.textContent =
    typeof result.status === "number" ? `${result.status} ${result.statusText || ""}`.trim() : "-";
  elements.responseError.textContent = result.error || "-";
  elements.responseBody.textContent = result.body || JSON.stringify(result, null, 2);
}

async function sendPayload() {
  clearResponse();

  const webhookUrl = elements.webhookUrl.value.trim();
  if (!webhookUrl) {
    elements.responseError.textContent = "Discord Webhook URL を入力してください。";
    return;
  }

  elements.sendButton.disabled = true;
  elements.sendButton.textContent = "Sending";

  try {
    const response = await fetch("/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhookUrl,
        payload: buildPayload(),
      }),
    });
    const result = await response.json();
    setResponse({
      status: result.status ?? response.status,
      statusText: result.statusText ?? response.statusText,
      body: result.body,
      error: result.error,
    });
  } catch (error) {
    elements.responseError.textContent = error instanceof Error ? error.message : "送信に失敗しました。";
  } finally {
    elements.sendButton.disabled = false;
    elements.sendButton.textContent = "Send";
  }
}

elements.form.addEventListener("input", (event) => {
  if (event.target === elements.presetSelect) {
    return;
  }

  elements.presetSelect.value = "custom";
  refreshPayloadPreview();
});
elements.presetSelect.addEventListener("change", () => applyPreset(elements.presetSelect.value));
elements.sendButton.addEventListener("click", sendPayload);
elements.clearResponseButton.addEventListener("click", clearResponse);
elements.copyPayloadButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.payloadPreview.textContent);
});

applyPreset("a");
