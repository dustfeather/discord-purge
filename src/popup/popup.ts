const btn = document.getElementById('open') as HTMLButtonElement | null;
btn?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = 'https://discord.com/channels/@me/';
  if (tab?.id && tab.url?.startsWith('https://discord.com/')) {
    await chrome.tabs.update(tab.id, { url });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
});
