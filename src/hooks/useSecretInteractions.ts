import { useEffect, useMemo, useRef } from 'react';
import type { HTMLAttributes } from 'react';
import { createSceneGestureController } from '../lib/scene-gestures';
import type { SceneGestureCallbacks } from '../lib/scene-gestures';

interface SecretInteractionOptions extends SceneGestureCallbacks {
  enabled: boolean;
}

/** Hidden mouse/touch interactions, with keyboard access and no visible hints. */
export function useSecretInteractions(options: SecretInteractionOptions) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useMemo(() => createSceneGestureController({
    onTap: () => { if (latest.current.enabled) latest.current.onTap(); },
    onPhotoTap: index => {
      if (!latest.current.enabled) return;
      if (latest.current.onPhotoTap) latest.current.onPhotoTap(index);
      else latest.current.onTap();
    },
    onDoubleTap: () => { if (latest.current.enabled) latest.current.onDoubleTap(); },
    onLongPress: index => { if (latest.current.enabled) latest.current.onLongPress(index); },
  }, {
    now: () => performance.now(),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: timer => window.clearTimeout(timer),
  }), []);

  useEffect(() => {
    if (!options.enabled) controller.cancel();
  }, [controller, options.enabled]);

  useEffect(() => {
    const cancel = () => controller.cancel();
    const onVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
      // cancel, rather than permanently disposing, also supports StrictMode's
      // cleanup/setup cycle on the same controller instance.
      cancel();
    };
  }, [controller]);

  const bind = useMemo<HTMLAttributes<HTMLDivElement>>(() => ({
    tabIndex: 0,
    onPointerDownCapture: event => {
      if (latest.current.enabled) controller.pointerDown(event);
    },
    onPointerMoveCapture: event => {
      if (latest.current.enabled) controller.pointerMove(event);
    },
    onPointerUpCapture: event => {
      if (latest.current.enabled) controller.pointerUp(event);
      else controller.cancel();
    },
    onPointerCancelCapture: event => controller.pointerCancel(event.pointerId),
    onPointerLeave: event => {
      // Touch creates a synthetic leave after release of implicit capture.
      if (event.pointerType !== 'touch') controller.pointerLeave(event.pointerId);
    },
    onContextMenu: event => {
      if (latest.current.enabled) event.preventDefault();
    },
    onDoubleClickCapture: event => {
      // Intent is already handled by the pointer sequence, once. Prevent text
      // selection / browser defaults without invoking a second double-tap action.
      if (latest.current.enabled) event.preventDefault();
    },
    onKeyDown: event => {
      if (!latest.current.enabled || event.target !== event.currentTarget || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        controller.cancel();
        latest.current.onTap();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        controller.cancel();
        latest.current.onDoubleTap();
      }
    },
  }), [controller]);

  const onPhotoPress = useMemo(() => (index: number) => {
    if (latest.current.enabled) controller.pickPhoto(index);
  }, [controller]);

  return { bind, onPhotoPress, cancel: controller.cancel };
}
