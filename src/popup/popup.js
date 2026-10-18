/* PureFocus popup: reads/writes settings and pushes them to open tabs. */
(() => {
  const { api, getSettings, setSettings, broadcast } = globalThis.PF;
  const inputs = [...document.querySelectorAll('input[data-key]')];
  const status = document.getElementById('status');

  const showStatus = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  };

  // Preferred path: the background relays to tabs and updates redirect rules.
  // If the background is unreachable, broadcast from here so live updates
  // still happen (storage.onChanged in the tabs is a further backup).
  const pushToTabs = async (settings) => {
    try {
      const response = await api.runtime.sendMessage({ type: 'pf:settings-changed', settings });
      if (response?.ok) return response.tabCount;
    } catch {
      /* fall through */
    }
    return broadcast(settings);
  };

  const onToggle = async (event) => {
    const input = event.currentTarget;
    try {
      const settings = await setSettings({ [input.dataset.key]: input.checked });
      const tabCount = await pushToTabs(settings);
      showStatus(
        tabCount > 0
          ? `Saved · applied to ${tabCount} open tab${tabCount === 1 ? '' : 's'}`
          : 'Saved · applies as soon as you open Instagram or YouTube'
      );
    } catch (err) {
      input.checked = !input.checked;
      showStatus(`Could not save: ${err?.message ?? err}`, true);
    }
  };

  const init = async () => {
    document.getElementById('version').textContent = `v${api.runtime.getManifest().version}`;
    const settings = await getSettings();
    for (const input of inputs) {
      input.checked = Boolean(settings[input.dataset.key]);
      input.addEventListener('change', onToggle);
    }
  };

  init().catch((err) => showStatus(`Could not load settings: ${err?.message ?? err}`, true));
})();
