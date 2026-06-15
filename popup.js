const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const titleInput = document.getElementById('title');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

let pollInterval = null;

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

function setSearching(on) {
  startBtn.disabled = on;
  stopBtn.style.display = on ? 'block' : 'none';
  progressBar.style.display = on ? 'block' : 'none';
  if (on) progressFill.classList.remove('done'); // restart indeterminate sweep
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

startBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim();
  if (!title) {
    setStatus('Please enter a video title.', 'error');
    return;
  }

  const tab = await getCurrentTab();
  if (!tab.url.includes('youtube.com')) {
    setStatus('Please open a YouTube channel Videos page first.', 'error');
    return;
  }

  if (!tab.url.includes('/videos') && !tab.url.includes('@') && !tab.url.includes('/channel/') && !tab.url.includes('/c/')) {
    setStatus('Navigate to a channel\'s Videos tab first.', 'error');
    return;
  }

  setSearching(true);
  setStatus('Scrolling and searching…', 'searching');

  const tabId = tab.id;

  // Send start message to content script
  chrome.tabs.sendMessage(tabId, { action: 'start', title }, () => {
    if (chrome.runtime.lastError) {
      setStatus('Could not connect to page. Try refreshing YouTube.', 'error');
      setSearching(false);
    }
  });

  // Poll for result (reuse the cached tab id — it does not change mid-search)
  pollInterval = setInterval(() => {
    chrome.tabs.sendMessage(tabId, { action: 'status' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      if (response.state === 'found') {
        clearInterval(pollInterval);
        progressFill.classList.add('done'); // freeze full + stop the sweep
        setTimeout(() => setSearching(false), 600);
        setStatus(`✓ Found it! ${response.count} videos scanned.`, 'found');
      } else if (response.state === 'not_found') {
        clearInterval(pollInterval);
        setSearching(false);
        setStatus(`Reached the end (${response.count} videos scanned) — not found. Check the spelling.`, 'error');
      } else if (response.state === 'stopped') {
        clearInterval(pollInterval);
        setSearching(false);
        setStatus('Stopped.', '');
      } else if (response.state === 'searching') {
        setStatus(`Scrolling… (${response.count} videos scanned)`, 'searching');
      }
    });
  }, 800);
});

stopBtn.addEventListener('click', async () => {
  clearInterval(pollInterval);
  const tab = await getCurrentTab();
  chrome.tabs.sendMessage(tab.id, { action: 'stop' });
  setSearching(false);
  setStatus('Stopped.', '');
});
