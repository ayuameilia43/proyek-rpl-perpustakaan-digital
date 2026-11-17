document.addEventListener("DOMContentLoaded", function () {
  setupSidebar();
  setupChatbot();
});

function setupSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const openButton = document.getElementById("sidebar-toggle");
  const closeButton = document.getElementById("sidebar-close");
  if (!sidebar) return;

  function setSidebarOpen(isOpen) {
    sidebar.classList.toggle("-translate-x-full", !isOpen);
    if (overlay) overlay.classList.toggle("hidden", !isOpen);
  }

  if (openButton) openButton.addEventListener("click", function () { setSidebarOpen(true); });
  if (closeButton) closeButton.addEventListener("click", function () { setSidebarOpen(false); });
  if (overlay) overlay.addEventListener("click", function () { setSidebarOpen(false); });
}

function setupChatbot() {
  const panel = document.getElementById("chatbot-panel");
  const messagesElement = document.getElementById("chatbot-messages");
  if (!panel || !messagesElement) return;

  const inputElement = document.getElementById("chatbot-input");
  const sendButton = document.getElementById("chatbot-send");
  const statusElement = document.getElementById("chatbot-status");
  const toggleButton = document.getElementById("chatbot-toggle");
  const closeButton = document.getElementById("chatbot-close");

  const messages = [
    {
      role: "assistant",
      content:
        "Halo! Saya Pustakawan Virtual. Saya bisa membantu mencari buku, info jam operasional, aturan denda, serta menjawab pertanyaan tentang akun Anda (buku yang sedang/sudah dipinjam, pengajuan, kuota, dan denda).",
    },
  ];
  let isBusy = false;
  let activeController = null;

  function createBubble(message) {
    const bubble = document.createElement("div");
    const baseClass = "whitespace-pre-wrap px-3 py-2 text-sm shadow-sm";
    bubble.className =
      message.role === "user"
        ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-brand text-white " + baseClass
        : "max-w-[85%] rounded-2xl rounded-tl-sm bg-white text-slate-700 " + baseClass;
    bubble.textContent = message.content;
    return bubble;
  }

  function scrollToBottom() {
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function renderMessages() {
    messagesElement.innerHTML = "";
    messages.forEach(function (message) {
      messagesElement.appendChild(createBubble(message));
    });
    scrollToBottom();
  }

  function setStatus(text) {
    if (statusElement) statusElement.textContent = text || "";
  }

  function abortActiveRequest() {
    if (activeController) activeController.abort();
  }

  function buildRequestMessages() {
    return messages.map(function (message) {
      return { role: message.role, content: message.content };
    });
  }

  function createStreamHandlers(assistant, assistantBubble, streamState) {
    return {
      meta: function (data) {
        if (data && data.fallback) setStatus("Mode cadangan aktif...");
      },
      token: function (data) {
        if (!data || !data.text) return;
        assistant.content += data.text;
        if (assistantBubble) assistantBubble.textContent = assistant.content;
        scrollToBottom();
      },
      error: function (data) {
        streamState.error = (data && data.message) || "Koneksi terputus.";
      },
      done: function (data) {
        if (data && data.error) streamState.error = data.error;
      },
    };
  }

  function finishStream(assistant, assistantBubble, errorMessage) {
    if (!assistant.content) assistant.content = "Maaf, saya belum bisa merespons saat ini. Silakan coba lagi.";
    if (assistantBubble) assistantBubble.textContent = assistant.content;
    setStatus(errorMessage);
    isBusy = false;
    activeController = null;
    scrollToBottom();
  }

  async function sendMessage() {
    const text = inputElement ? inputElement.value.trim() : "";
    if (!text || isBusy) return;

    isBusy = true;
    setStatus("Mengetik...");
    messages.push({ role: "user", content: text });
    const requestMessages = buildRequestMessages();
    const assistant = { role: "assistant", content: "" };
    messages.push(assistant);
    if (inputElement) inputElement.value = "";
    renderMessages();

    const assistantBubble = messagesElement.lastElementChild;
    const streamState = { error: "" };
    activeController = new AbortController();

    try {
      await streamChatReply(
        { messages: requestMessages, _csrf: panel.getAttribute("data-csrf") || "" },
        activeController.signal,
        createStreamHandlers(assistant, assistantBubble, streamState)
      );
    } catch (error) {
      if (error.name !== "AbortError") streamState.error = error.message || "Gagal menghubungi asisten.";
    } finally {
      finishStream(assistant, assistantBubble, streamState.error);
    }
  }

  if (sendButton) sendButton.addEventListener("click", sendMessage);
  if (inputElement) {
    inputElement.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      sendMessage();
    });
  }
  if (toggleButton) {
    toggleButton.addEventListener("click", function () {
      panel.classList.toggle("hidden");
    });
  }
  if (closeButton) {
    closeButton.addEventListener("click", function () {
      panel.classList.add("hidden");
      abortActiveRequest();
    });
  }

  window.addEventListener("beforeunload", abortActiveRequest);
  renderMessages();
}

async function extractHttpError(response) {
  const rawBody = await response.text();
  try {
    const errorBody = JSON.parse(rawBody);
    return errorBody.error || rawBody.slice(0, 200) || "Asisten sedang tidak tersedia.";
  } catch (error) {
    return rawBody.slice(0, 200) || "Asisten sedang tidak tersedia.";
  }
}

async function assertEventStreamResponse(response) {
  if (!response.ok) throw new Error(await extractHttpError(response));

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    await response.text();
    throw new Error("Sesi Anda mungkin telah berakhir. Muat ulang halaman lalu coba lagi.");
  }

  if (!response.body) throw new Error("Browser tidak mendukung streaming respons.");
  return response.body;
}

async function streamChatReply(payload, signal, handlers) {
  const response = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal: signal,
  });
  const body = await assertEventStreamResponse(response);
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = consumeSseBuffer(buffer, handlers);
    }
    buffer += decoder.decode();
    consumeSseBuffer(buffer + "\n\n", handlers);
  } finally {
    reader.releaseLock();
  }
}

function consumeSseBuffer(buffer, handlers) {
  buffer = buffer.replace(/\r\n/g, "\n");
  let boundary = buffer.indexOf("\n\n");

  while (boundary !== -1) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    if (block.trim()) dispatchSseBlock(block, handlers);
    boundary = buffer.indexOf("\n\n");
  }

  return buffer;
}

function dispatchSseBlock(block, handlers) {
  let eventName = "message";
  const dataLines = [];

  block.split("\n").forEach(function (line) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  });

  if (!dataLines.length || typeof handlers[eventName] !== "function") return;

  try {
    handlers[eventName](JSON.parse(dataLines.join("\n")));
  } catch (error) {
    return;
  }
}
