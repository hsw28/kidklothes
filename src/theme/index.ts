import { Platform, useColorScheme } from 'react-native';

export type AccentName = 'coral' | 'periwinkle' | 'sage';
export type AppTheme = {
  isDark: boolean;
  colors: {
    bg: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentSoft: string;
    accentPrimary: string;
    accentPrimarySoft: string;
    accentSecondary: string;
    accentSecondarySoft: string;
    placeholder: string;
    background: string;
    card: string;
    textPrimary: string;
    textSecondary: string;
    chipBg: string;
    inputBg: string;
    accentCoral: string;
    accentPeriwinkle: string;
    accentSage: string;
    accentCoralSoft: string;
    accentPeriwinkleSoft: string;
    accentSageSoft: string;
    mutedBadgeBg: string;
    mutedBadgeText: string;
    shadow: string;
  };
  spacing: {
    screen: number;
    section: number;
    cardGap: number;
    cardPadding: number;
    chipPadX: number;
    chipPadY: number;
  };
  radius: {
    card: number;
    tile: number;
    chip: number;
  };
  fonts: {
    sans: string;
    serif: string;
  };
};

const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    bg: '#F8F4EF',
    surface: '#FFFFFF',
    surfaceMuted: '#FAF5F1',
    border: '#EAE1D8',
    text: '#1F1A17',
    textMuted: '#716A63',
    accent: '#E89C8A',
    accentSoft: '#F7E4DE',
    accentPrimary: '#E89C8A',
    accentPrimarySoft: '#F7E4DE',
    accentSecondary: '#A9C3AE',
    accentSecondarySoft: '#E8F0EA',
    placeholder: '#F4EEE8',
    background: '#F8F4EF',
    card: '#FFFFFF',
    textPrimary: '#1F1A17',
    textSecondary: '#716A63',
    chipBg: '#FAF5F1',
    inputBg: '#FFFFFF',
    accentCoral: '#E89C8A',
    accentPeriwinkle: '#A8B5E2',
    accentSage: '#A9C3AE',
    accentCoralSoft: '#F7E4DE',
    accentPeriwinkleSoft: '#ECEFFA',
    accentSageSoft: '#E8F0EA',
    mutedBadgeBg: '#F6F1EC',
    mutedBadgeText: '#625D57',
    shadow: '#111827',
  },
  spacing: {
    screen: 20,
    section: 20,
    cardGap: 16,
    cardPadding: 16,
    chipPadX: 14,
    chipPadY: 8,
  },
  radius: {
    card: 20,
    tile: 18,
    chip: 999,
  },
  fonts: {
    sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) ?? 'System',
    serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) ?? 'serif',
  },
};

const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    bg: '#1C1C1E',
    surface: '#2A2A2E',
    surfaceMuted: '#313137',
    border: '#3A3A40',
    text: '#FFFFFF',
    textMuted: '#B0B0B5',
    accent: '#CF8A7B',
    accentSoft: '#4A3733',
    accentPrimary: '#CF8A7B',
    accentPrimarySoft: '#4A3733',
    accentSecondary: '#8EA995',
    accentSecondarySoft: '#37453C',
    placeholder: '#34343A',
    background: '#1C1C1E',
    card: '#2A2A2E',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B5',
    chipBg: '#313137',
    inputBg: '#313137',
    accentCoral: '#CF8A7B',
    accentPeriwinkle: '#8F9CCB',
    accentSage: '#8EA995',
    accentCoralSoft: '#4A3733',
    accentPeriwinkleSoft: '#353B4D',
    accentSageSoft: '#37453C',
    mutedBadgeBg: '#3A3A40',
    mutedBadgeText: '#C4C4C9',
    shadow: '#000000',
  },
  spacing: lightTheme.spacing,
  radius: lightTheme.radius,
  fonts: lightTheme.fonts,
};

export const useAppTheme = (): AppTheme => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
};

export const getAccentColors = (theme: AppTheme, accent: AccentName, selected: boolean) => {
  if (accent === 'coral') {
    return selected
      ? { bg: theme.colors.accentCoralSoft, text: theme.colors.textPrimary }
      : { bg: theme.colors.surfaceMuted, text: theme.colors.textSecondary };
  }
  if (accent === 'sage') {
    return selected
      ? { bg: theme.colors.accentSageSoft, text: theme.colors.textPrimary }
      : { bg: theme.colors.surfaceMuted, text: theme.colors.textSecondary };
  }
  return selected
    ? { bg: theme.colors.accentPeriwinkleSoft, text: theme.colors.textPrimary }
    : { bg: theme.colors.surfaceMuted, text: theme.colors.textSecondary };
};
