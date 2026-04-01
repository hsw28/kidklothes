import type { JsonType } from '@posthog/core';
import type { PostHog } from 'posthog-react-native';
import { appConfig } from '@/config';

type CapturePayload = Record<string, JsonType> | undefined;

type PostHogDebugState = {
  configured: boolean;
  apiKeyPresent: boolean;
  host?: string;
  clientReady: boolean;
  lastAttemptedEvent?: string;
  lastAttemptedAt?: number;
  lastSuccessfulEvent?: string;
  lastSuccessfulAt?: number;
  lastFailureEvent?: string;
  lastFailureAt?: number;
  lastFailureReason?: string;
};

let client: PostHog | null = null;

const debugState: PostHogDebugState = {
  configured: Boolean(appConfig.posthog.apiKey && appConfig.posthog.host),
  apiKeyPresent: Boolean(appConfig.posthog.apiKey),
  host: appConfig.posthog.host || undefined,
  clientReady: false,
};

export const registerPostHogClient = (nextClient: PostHog | null) => {
  client = nextClient;
  debugState.clientReady = Boolean(nextClient);
};

export const getPostHogDebugState = (): PostHogDebugState => ({ ...debugState });

export const capturePostHogEvent = async (event: string, payload?: CapturePayload): Promise<void> => {
  debugState.lastAttemptedEvent = event;
  debugState.lastAttemptedAt = Date.now();

  if (!debugState.configured || !client) {
    debugState.clientReady = Boolean(client);
    if (__DEV__ && debugState.configured && !client) {
      console.warn('[PostHog] capture skipped because client is not ready yet', { event });
    }
    return;
  }

  try {
    await Promise.resolve(client.capture(event, payload));
    debugState.lastSuccessfulEvent = event;
    debugState.lastSuccessfulAt = Date.now();
    debugState.lastFailureEvent = undefined;
    debugState.lastFailureAt = undefined;
    debugState.lastFailureReason = undefined;
  } catch (error) {
    debugState.lastFailureEvent = event;
    debugState.lastFailureAt = Date.now();
    debugState.lastFailureReason = error instanceof Error ? error.message : 'capture_failed';
    if (__DEV__) {
      console.warn('[PostHog] capture failed', {
        event,
        reason: debugState.lastFailureReason,
      });
    }
  }
};
