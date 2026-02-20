declare module 'react-native-view-shot' {
  import type { Component } from 'react';
  import type { ViewProps } from 'react-native';

  export interface CaptureOptions {
    format?: 'png' | 'jpg' | 'webm';
    quality?: number;
    result?: 'tmpfile' | 'base64' | 'data-uri';
  }

  export default class ViewShot extends Component<ViewProps & { options?: CaptureOptions; collapsable?: boolean }> {
    capture: (options?: CaptureOptions) => Promise<string>;
  }
}
