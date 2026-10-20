(() => {
  "use strict";
  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  const apiBase = (window.SHAREBOX_API_BASE || "").replace(/\/+$/, "");
  const input = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const uploadBtn = document.getElementById("uploadBtn");
  const status = document.getElementById("status");
  const chooseBtn = document.getElementById("chooseBtn");
  let files = [];
  let uploading = false;

  const style = document.createElement("style");
  style.textContent = `
    #multiFileList{display:block;margin:18px 0;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
    .ms-file-row{padding:14px 0;border-bottom:1px solid var(--line)}
    .ms-file-row:last-child{border-bottom:0}
    .ms-file-top{display:flex;align-items:flex-start;gap:12px}
    .ms-file-info{min-width:0;flex:1}
    .ms-file-name{font-weight:650;overflow-wrap:anywhere;color:var(--ink)}
    .ms-file-meta{font-size:.86rem;color:var(--muted);margin-top:5px}
    .ms-remove{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;color:var(--muted);padding:8px;transition:all .18s}
    .ms-remove:hover{color:var(--danger);border-color:var(--danger);background:var(--danger-soft)}
    .ms-remove svg{width:100%;height:100%}
    .ms-remove:disabled{opacity:.45;cursor:not-allowed}
    .ms-progress-wrap{margin-top:12px}
    .ms-progress-label{display:flex;justify-content:space-between;gap:8px;font-size:.85rem;color:var(--muted);margin-bottom:7px}
    .ms-progress-track{height:8px;background:var(--line);border-radius:99px;overflow:hidden}
    .ms-progress-bar{height:100%;width:0;background:var(--primary);border-radius:99px;transition:width .12s linear}
    .ms-progress-bar.done{background:var(--success)}
    .ms-progress-bar.failed{background:var(--danger)}
    .ms-file-link{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .ms-file-link input{min-width:0;flex:1;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--input);color:var(--ink)}
    .ms-file-link button{cursor:pointer}
    .ms-list-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px;color:var(--ink)}
  `;
  document.head.appendChild(style);

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }
  function getList() {
    let list = document.getElementById("multiFileList");
    if (!list) {
      list = document.createElement("div");
      list.id = "multiFileList";
      list.className = "selected-file";
      dropzone.insertAdjacentElement("afterend", list);
    }
    return list;
  }
  function renderFiles() {
    const list = getList();
    list.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "ms-list-heading";
    const label = document.createElement("strong");
    label.textContent = `${files.length} file${files.length === 1 ? "" : "s"} selected`;
    heading.appendChild(label);
    list.appendChild(heading);

    files.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "ms-file-row";
      row.dataset.fileIndex = String(index);
      const top = document.createElement("div");
      top.className = "ms-file-top";
      const info = document.createElement("div");
      info.className = "ms-file-info";
      const name = document.createElement("div");
      name.className = "ms-file-name";
      name.textContent = entry.file.name;
      const meta = document.createElement("div");
      meta.className = "ms-file-meta";
      meta.textContent = `${formatSize(entry.file.size)} · ${entry.state || "Waiting to upload"}`;
      info.append(name, meta);
      top.appendChild(info);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ms-remove";
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      remove.setAttribute("aria-label", `Remove ${entry.file.name}`);
      remove.disabled = uploading || entry.state === "Complete";
      remove.addEventListener("click", () => {
        if (uploading) return;
        files.splice(index, 1);
        input.value = "";
        renderFiles();
        uploadBtn.disabled = files.length === 0;
        setUploadButtonText();
        setStatus(files.length ? "Selected file removed." : "Choose files to begin.");
      });
      top.appendChild(remove);
      row.appendChild(top);

      const progressWrap = document.createElement("div");
      progressWrap.className = "ms-progress-wrap";
      const progressLabel = document.createElement("div");
      progressLabel.className = "ms-progress-label";
      const progressText = document.createElement("span");
      progressText.textContent = entry.state || "Waiting to upload";
      const percent = document.createElement("span");
      percent.textContent = `${entry.progress || 0}%`;
      progressLabel.append(progressText, percent);
      const track = document.createElement("div");
      track.className = "ms-progress-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(entry.progress || 0));
      const bar = document.createElement("div");
      bar.className = "ms-progress-bar";
      bar.style.width = `${entry.progress || 0}%`;
      if (entry.state === "Complete") bar.classList.add("done");
      if (entry.state === "Failed") bar.classList.add("failed");
      track.appendChild(bar);
      progressWrap.append(progressLabel, track);
      row.appendChild(progressWrap);

      if (entry.url) {
        const linkWrap = document.createElement("div");
        linkWrap.className = "ms-file-link";
        const link = document.createElement("input");
        link.type = "text";
        link.readOnly = true;
        link.value = entry.url;
        link.setAttribute("aria-label", `Share link for ${entry.file.name}`);
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "button button-dark";
        copy.textContent = "Copy link";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(entry.url);
            copy.textContent = "Copied!";
          } catch {
            link.focus(); link.select();
            try { document.execCommand("copy"); copy.textContent = "Copied!"; }
            catch { copy.textContent = "Select link to copy"; }
          }
        });
        linkWrap.append(link, copy);
        row.appendChild(linkWrap);
      }
      if (entry.error) {
        const err = document.createElement("div");
        err.className = "ms-file-meta";
        err.style.color = "#dc2626";
        err.textContent = entry.error;
        row.appendChild(err);
      }
      list.appendChild(row);
    });
    if (!files.length) list.remove();
  }
  function setUploadButtonText() {
    const span = uploadBtn.querySelector("span");
    if (span) span.textContent = files.length > 1 ? `Upload ${files.length} files` : "Upload file";
  }
  function selectFiles(fileList) {
    if (uploading) return;
    const selected = Array.from(fileList || []);
    const tooLarge = selected.filter(file => file.size > MAX_FILE_SIZE);
    files = selected.filter(file => file.size <= MAX_FILE_SIZE).map(file => ({
      file, progress: 0, state: "Waiting to upload", url: "", error: ""
    }));
    if (tooLarge.length) {
      setStatus("Files must be 100 MB or smaller: " + tooLarge.map(f => f.name).join(", "), true);
    } else {
      setStatus(files.length ? "" : "Choose files to begin.");
    }
    renderFiles();
    uploadBtn.disabled = files.length === 0;
    setUploadButtonText();
    const oldResult = document.getElementById("multiUploadResults");
    if (oldResult) oldResult.remove();
  }

  input.multiple = true;
  dropzone.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    input.click();
  });
  chooseBtn.addEventListener("click", event => { event.stopPropagation(); input.click(); });
  input.addEventListener("change", () => selectFiles(input.files));
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault(); dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault(); dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", event => {
    if (uploading) return;
    selectFiles(event.dataTransfer.files);
  });

  function uploadOne(entry, index, total) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("file", entry.file, entry.file.name);
      entry.state = "Uploading";
      entry.progress = 0;
      renderFiles();
      setStatus(`Uploading ${index + 1} of ${total}: ${entry.file.name}`);
      xhr.open("POST", apiBase + "/api/upload");
      xhr.upload.addEventListener("progress", event => {
        if (event.lengthComputable) {
          entry.progress = Math.min(99, Math.round(event.loaded / event.total * 100));
          renderFiles();
        }
      });
      xhr.addEventListener("load", () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data.shareUrl) {
          entry.progress = 100;
          entry.state = "Completed";
          entry.url = data.shareUrl;
          entry.error = "";
          renderFiles();
          resolve();
        } else {
          reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network or CORS error. Check your Worker and internet connection.")));
      xhr.addEventListener("timeout", () => reject(new Error("Upload timed out. Please try again.")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
      xhr.timeout = 0;
      xhr.send(form);
    }).catch(error => {
      entry.state = "Failed";
      entry.error = error.message || "Upload failed";
      renderFiles();
    });
  }

  uploadBtn.addEventListener("click", async () => {
    if (!files.length || uploading) return;
    if (!apiBase || apiBase.includes("YOUR-WORKER-NAME")) {
      setStatus("Set your Cloudflare Worker URL in config.js.", true);
      return;
    }
    uploading = true;
    uploadBtn.disabled = true;
    const queue = files.filter(entry => entry.state !== "Completed");
    renderFiles();
    try {
      for (const entry of queue) {
        await uploadOne(entry, queue.indexOf(entry), queue.length);
      }
      const completed = files.filter(entry => entry.state === "Completed").length;
      const failed = files.filter(entry => entry.state === "Failed").length;
      setStatus(`Finished: ${completed} uploaded, ${failed} failed.`);
    } finally {
      uploading = false;
      uploadBtn.disabled = files.every(entry => entry.state === "Completed") || files.length === 0;
      setUploadButtonText();
      renderFiles();
    }
  });
})();
