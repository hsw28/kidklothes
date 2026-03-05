export const copyTextToClipboard = (text: string): boolean => {
  try {
    const rn = require('react-native');
    const clipboard = rn?.Clipboard;
    if (clipboard && typeof clipboard.setString === 'function') {
      clipboard.setString(text);
      return true;
    }
  } catch {
    // no-op
  }
  return false;
};

export const showCopyPostOptions = (onChoose: () => void) => {
  onChoose();
};
