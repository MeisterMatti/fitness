// Wo läuft die App? Als Claude-Seite (claude.ai) oder als eigene Web-App.
export const IN_CLAUDE = typeof (window.claude && window.claude.use) === 'function';

/** Eine Fähigkeit der Claude-Seite holen (Speicher, Diktieren, Dateien). null = nicht verfügbar. */
export function cap(name) {
  if (!IN_CLAUDE) return Promise.resolve(null);
  try { return Promise.resolve(window.claude.use(name)).catch(() => null); }
  catch { return Promise.resolve(null); }
}

/** storage: 'local' = auf diesem Gerät, 'cloud' = im Claude-Konto */
export const env = { storage: 'local' };
