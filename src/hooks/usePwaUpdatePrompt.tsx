import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTROLLER_RELOAD_KEY,
  VERSION_RELOAD_KEY,
  clearControllerReloadIfUpdated,
  clearVersionReloadIfCurrent,
  deferAppReload,
  isEditorPath,
  markControllerReload,
  markVersionReload,
  planAppUpdate,
  watchAppUpdateSignals,
  type AppUpdateCause,
} from "@/utils/appUpdate";
import { documentEditorBlocksReload } from "@/utils/documentEditor";
import { fetchDeployedVersion, forceRefresh, clearAllCaches, getCurrentVersion } from "@/utils/versionManager";

interface UsePwaUpdatePrompt {
  needRefresh: boolean;
  offlineReady: boolean;
  updating: boolean;
  promptUpdate: () => void;
  forceUpdate: () => void;
  dismissPrompt: () => void;
  clearCaches: () => void;
}

export function usePwaUpdatePrompt(): UsePwaUpdatePrompt {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const pendingHash = useRef<string | null>(null);
  const reloadNow = useRef<() => void>(() => {});
  const dismissUpdate = useRef<() => void>(() => {});

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const running = getCurrentVersion();
    clearVersionReloadIfCurrent(sessionStorage, running.hash);
    clearControllerReloadIfUpdated(sessionStorage, running.hash);
    let cancelled = false;
    let reloading = false;
    let deferredStop: (() => void) | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    const hasServiceWorker = "serviceWorker" in navigator;
    let hadController = hasServiceWorker && Boolean(navigator.serviceWorker.controller);

    const editorOpen = () => documentEditorBlocksReload() || isEditorPath(window.location.pathname);

    const commitReload = (mark: AppUpdateCause, hash: string | null) => {
      if (reloading || editorOpen()) return;
      reloading = true;
      deferredStop?.();
      deferredStop = null;
      setUpdating(false);
      if (mark === "version" && hash) markVersionReload(sessionStorage, hash);
      if (mark === "controller") markControllerReload(sessionStorage, getCurrentVersion().hash);
      window.location.reload();
    };

    const armNavigationReload = (mark: AppUpdateCause, hash: string | null) => {
      if (deferredStop) return;
      deferredStop = deferAppReload(window, () => {
        deferredStop = null;
        commitReload(mark, hash);
      }, () => {
        if (!editorOpen()) return false;
        setUpdating(true);
        return true;
      });
    };

    const apply = (plan: ReturnType<typeof planAppUpdate>, hash: string | null) => {
      if (cancelled || reloading || plan.action === "skip") return;
      if (plan.action === "prompt") {
        setUpdating(true);
        armNavigationReload(plan.mark, hash);
        return;
      }
      setUpdating(false);
      armNavigationReload(plan.mark, hash);
    };

    const snapshot = () => {
      return {
        dev: false,
        current: getCurrentVersion(),
        versionReloadHash: sessionStorage.getItem(VERSION_RELOAD_KEY),
        controllerReloadHash: sessionStorage.getItem(CONTROLLER_RELOAD_KEY),
        editor: editorOpen(),
        hadController,
      };
    };

    const checkDeployedVersion = async () => {
      if (cancelled || reloading) return;
      try {
        await registration?.update();
      } catch {
        // A failed update check still leaves version.json as the deploy signal.
      }
      const server = await fetchDeployedVersion();
      if (cancelled || reloading || !server) return;
      pendingHash.current = server.hash;
      apply(planAppUpdate({ ...snapshot(), cause: "version", server }), server.hash);
    };

    const onControllerChange = () => {
      const had = hadController;
      hadController = true;
      if (!had) return;
      apply(planAppUpdate({ ...snapshot(), cause: "controller", server: null, hadController: true }), pendingHash.current);
    };

    reloadNow.current = () => {
      if (reloading) return;
      reloading = true;
      deferredStop?.();
      deferredStop = null;
      setUpdating(false);
      if (pendingHash.current) markVersionReload(sessionStorage, pendingHash.current);
      window.location.reload();
    };
    dismissUpdate.current = () => {
      deferredStop?.();
      deferredStop = null;
      setUpdating(false);
      setNeedRefresh(false);
    };

    if (hasServiceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((next) => {
          if (cancelled) return;
          registration = next;
          if (next.active) setOfflineReady(true);
          return checkDeployedVersion();
        })
        .catch(() => {
          // The page can still reload from version.json when registration fails.
        });
    }

    const stopWatch = watchAppUpdateSignals(() => {
      void checkDeployedVersion();
    });

    return () => {
      cancelled = true;
      stopWatch();
      deferredStop?.();
      if (hasServiceWorker) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const promptUpdate = useCallback(() => {
    reloadNow.current();
  }, []);

  const forceUpdate = useCallback(async () => {
    await forceRefresh();
  }, []);

  const clearCaches = useCallback(async () => {
    await clearAllCaches();
    setNeedRefresh(false);
  }, []);

  const dismissPrompt = useCallback(() => {
    dismissUpdate.current();
  }, []);

  return {
    needRefresh,
    offlineReady,
    updating,
    promptUpdate,
    forceUpdate,
    dismissPrompt,
    clearCaches,
  };
}
