import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { CollageView, ItemCardView } from '@/components/bst/BstAssetRenderers';
import {
  buildCollageFilePrefix,
  buildCollageViewModels,
  buildItemCardFilePrefix,
  buildItemCardViewModels,
  BstGenerationOptions,
  BstImageGeneratorHandle,
  BstImageGeneratorInput,
  persistCapturedUri,
} from '@/services/bst/bstImageGenerator';

type RenderJob =
  | { kind: 'idle' }
  | { kind: 'collage'; model: ReturnType<typeof buildCollageViewModels>[number]; expectedLoads: number }
  | { kind: 'item'; model: ReturnType<typeof buildItemCardViewModels>[number]; expectedLoads: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const captureViewShotSafely = async (viewShotRef: React.RefObject<ViewShot | null>): Promise<string> => {
  const capture = (viewShotRef.current as any)?.capture;
  if (typeof capture !== 'function') {
    throw new Error('BST image capture is unavailable right now.');
  }

  try {
    const primary = await capture({ format: 'jpg', quality: 0.92, result: 'tmpfile' });
    if (primary) return primary;
  } catch {
    // Try one lighter fallback before surfacing an error.
  }

  const fallback = await capture({ format: 'jpg', quality: 0.82, result: 'tmpfile' });
  if (!fallback) {
    throw new Error('BST image capture failed. Try again in a moment.');
  }
  return fallback;
};

export const BstImageGenerationHost = forwardRef<BstImageGeneratorHandle>((_, ref) => {
  const viewShotRef = useRef<ViewShot | null>(null);
  const readyResolverRef = useRef<(() => void) | null>(null);
  const loadedCountRef = useRef(0);
  const jobKeyRef = useRef('');
  const expectedLoadsRef = useRef(0);
  const [renderJob, setRenderJob] = useState<RenderJob>({ kind: 'idle' });
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const resolveIfReady = (jobKey?: string, expectedLoads?: number) => {
    if (!readyResolverRef.current) return;
    if (jobKey && jobKeyRef.current !== jobKey) return;
    if ((expectedLoads ?? 0) > 0 && loadedCountRef.current < (expectedLoads ?? 0)) return;
    if (readyResolverRef.current) {
      const resolve = readyResolverRef.current;
      readyResolverRef.current = null;
      resolve();
    }
  };

  const runCaptureSequence = async (
    jobs: Array<{ prefix: string; render: RenderJob }>,
    options?: BstGenerationOptions,
    phase: 'collage' | 'item-card' = 'collage',
  ): Promise<string[]> => {
    const uris: string[] = [];
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const expectedLoads = job.render.kind === 'idle' ? 0 : job.render.expectedLoads;
      const jobKey = `${phase}-${index}-${Date.now()}`;
      jobKeyRef.current = jobKey;
      expectedLoadsRef.current = expectedLoads;
      readyResolverRef.current = null;
      loadedCountRef.current = 0;
      options?.onProgress?.({
        phase,
        current: index + 1,
        total: jobs.length,
        label: phase === 'collage' ? `Rendering collage ${index + 1} of ${jobs.length}` : `Rendering item card ${index + 1} of ${jobs.length}`,
      });
      setRenderJob(job.render);
      await wait(120);

      const waitForAssets = new Promise<void>((resolve) => {
        if (expectedLoads === 0) {
          resolve();
          return;
        }
        readyResolverRef.current = resolve;
        resolveIfReady(jobKey, expectedLoads);
        setTimeout(() => {
          if (readyResolverRef.current && jobKeyRef.current === jobKey) {
            const fallbackResolve = readyResolverRef.current;
            readyResolverRef.current = null;
            fallbackResolve();
          }
        }, 3200);
      });

      await waitForAssets;
      await wait(220);

      const capturedUri = await captureViewShotSafely(viewShotRef);
      uris.push(await persistCapturedUri(capturedUri, job.prefix, index));
      readyResolverRef.current = null;
      expectedLoadsRef.current = 0;
      setRenderJob({ kind: 'idle' });
      await wait(120);
    }
    return uris;
  };

  const enqueue = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(work, work);
    queueRef.current = next.then(() => undefined, () => undefined);
    return next;
  };

  useImperativeHandle(ref, () => ({
    generateCollages: async (input: BstImageGeneratorInput, options?: BstGenerationOptions) => enqueue(async () => {
      const models = buildCollageViewModels(input);
      return runCaptureSequence(
        models.map((model) => ({
          prefix: buildCollageFilePrefix(input.draft),
          render: {
            kind: 'collage',
            model,
            expectedLoads: model.items.filter((entry) => Boolean(entry.resolvedPhotoUri)).length,
          },
        })),
        options,
        'collage',
      );
    }),
    generateItemCards: async (input: BstImageGeneratorInput, options?: BstGenerationOptions) => enqueue(async () => {
      const models = buildItemCardViewModels(input);
      return runCaptureSequence(
        models.map((model) => ({
          prefix: buildItemCardFilePrefix(input.draft),
          render: {
            kind: 'item',
            model,
            expectedLoads: model.entry.resolvedPhotoUri ? 1 : 0,
          },
        })),
        options,
        'item-card',
      );
    }),
    generateAll: async (input: BstImageGeneratorInput, options?: BstGenerationOptions) => enqueue(async () => {
      const collageUris = await runCaptureSequence(
        buildCollageViewModels(input).map((model) => ({
          prefix: buildCollageFilePrefix(input.draft),
          render: {
            kind: 'collage',
            model,
            expectedLoads: model.items.filter((entry) => Boolean(entry.resolvedPhotoUri)).length,
          },
        })),
        options,
        'collage',
      );
      const itemCardUris = await runCaptureSequence(
        buildItemCardViewModels(input).map((model) => ({
          prefix: buildItemCardFilePrefix(input.draft),
          render: {
            kind: 'item',
            model,
            expectedLoads: model.entry.resolvedPhotoUri ? 1 : 0,
          },
        })),
        options,
        'item-card',
      );
      return { collageUris, itemCardUris };
    }),
  }), []);

  const styles = StyleSheet.create({
    host: {
      position: 'absolute',
      left: -4000,
      top: 0,
      opacity: 1,
      width: 1080,
      zIndex: -1,
      pointerEvents: 'none',
    },
  });

  const onAssetLoadEnd = () => {
    loadedCountRef.current += 1;
    resolveIfReady(jobKeyRef.current, expectedLoadsRef.current);
  };

  return (
    <View style={styles.host}>
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
        {renderJob.kind === 'collage' ? <CollageView {...renderJob.model} onAssetLoadEnd={onAssetLoadEnd} /> : null}
        {renderJob.kind === 'item' ? <ItemCardView {...renderJob.model} onAssetLoadEnd={onAssetLoadEnd} /> : null}
      </ViewShot>
    </View>
  );
});

BstImageGenerationHost.displayName = 'BstImageGenerationHost';
