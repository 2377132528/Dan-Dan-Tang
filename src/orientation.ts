export interface DeviceInfo {
  isMobile: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isForceLandscape: boolean;
  isFullscreen: boolean;
}

export function checkIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const search = window.location.search;
  if (search.includes('mobile=1') || search.includes('is_mobile=true')) return true;
  if (search.includes('desktop=1')) return false;

  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
  if (mobileUA) return true;

  const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (isIPad) return true;

  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = Math.min(window.screen.width, window.screen.height) <= 900;
  if (hasTouch && isCoarse && isSmallScreen) return true;

  return false;
}

export function checkIsPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
    return true;
  }
  return window.innerHeight > window.innerWidth;
}

export class OrientationController {
  private overlay: HTMLElement | null = null;
  private btnFullscreenPrompt: HTMLElement | null = null;
  private btnForcePrompt: HTMLElement | null = null;
  private btnIgnorePrompt: HTMLElement | null = null;
  private btnExitForce: HTMLElement | null = null;
  private hudFullscreenBtn: HTMLElement | null = null;
  private menuFullscreenBtn: HTMLElement | null = null;

  private isIgnored = false;
  private isForce = false;
  private listeners: Array<(info: DeviceInfo) => void> = [];

  constructor() {
    this.initElements();
    this.bindEvents();
    this.update();
  }

  private initElements(): void {
    this.overlay = document.getElementById('orientation-overlay');
    this.btnFullscreenPrompt = document.getElementById('btn-orient-fullscreen');
    this.btnForcePrompt = document.getElementById('btn-orient-force');
    this.btnIgnorePrompt = document.getElementById('btn-orient-ignore');
    this.btnExitForce = document.getElementById('btn-exit-force-landscape');
    this.hudFullscreenBtn = document.getElementById('btn-fullscreen');
    this.menuFullscreenBtn = document.getElementById('menu-fullscreen-btn');
  }

  private bindEvents(): void {
    const handleResizeOrOrient = () => {
      // 屏幕物理方向一旦变横屏，重置 ignore 状态
      if (!checkIsPortrait()) {
        this.isIgnored = false;
      }
      this.update();
    };

    window.addEventListener('resize', handleResizeOrOrient);
    window.addEventListener('orientationchange', handleResizeOrOrient);
    if (screen.orientation && 'addEventListener' in screen.orientation) {
      screen.orientation.addEventListener('change', handleResizeOrOrient);
    }
    document.addEventListener('fullscreenchange', () => this.updateFullscreenUI());
    document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenUI());

    this.btnFullscreenPrompt?.addEventListener('click', async () => {
      await this.requestFullscreenAndLockLandscape();
      this.isIgnored = true;
      this.update();
    });

    this.btnForcePrompt?.addEventListener('click', () => {
      this.setForceLandscape(true);
    });

    this.btnIgnorePrompt?.addEventListener('click', () => {
      this.isIgnored = true;
      this.update();
    });

    this.btnExitForce?.addEventListener('click', () => {
      this.setForceLandscape(false);
    });

    this.hudFullscreenBtn?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    this.menuFullscreenBtn?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
  }

  public getInfo(): DeviceInfo {
    const isMobile = checkIsMobile();
    const isPortrait = checkIsPortrait();
    const isLandscape = !isPortrait;
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
    );

    return {
      isMobile,
      isPortrait,
      isLandscape,
      isForceLandscape: this.isForce,
      isFullscreen,
    };
  }

  public addChangeListener(fn: (info: DeviceInfo) => void): void {
    this.listeners.push(fn);
  }

  public update(): void {
    const info = this.getInfo();
    const body = document.body;

    if (info.isMobile) {
      body.classList.add('is-mobile');
    } else {
      body.classList.remove('is-mobile');
    }

    if (info.isPortrait) {
      body.classList.add('is-portrait');
      body.classList.remove('is-landscape');
    } else {
      body.classList.add('is-landscape');
      body.classList.remove('is-portrait');
    }

    if (this.isForce) {
      body.classList.add('force-landscape');
      this.btnExitForce?.classList.remove('hidden');
    } else {
      body.classList.remove('force-landscape');
      this.btnExitForce?.classList.add('hidden');
    }

    // 是否需要显示横屏引导遮罩：
    // 条件：是移动端、处于竖屏、未开启强制横向显示、且用户本次未点击“暂不旋转”
    const shouldShowOverlay = info.isMobile && info.isPortrait && !this.isForce && !this.isIgnored;

    if (this.overlay) {
      if (shouldShowOverlay) {
        this.overlay.classList.remove('hidden');
        // 触发动画重绘
        requestAnimationFrame(() => {
          this.overlay?.classList.add('visible');
        });
      } else {
        this.overlay.classList.remove('visible');
        // 平滑过渡后隐藏
        this.overlay.classList.add('hidden');
      }
    }

    this.updateFullscreenUI();

    for (const listener of this.listeners) {
      listener(info);
    }
  }

  public setForceLandscape(enabled: boolean): void {
    this.isForce = enabled;
    if (enabled) {
      this.isIgnored = true;
    }
    this.update();
  }

  public async requestFullscreenAndLockLandscape(): Promise<void> {
    try {
      const docEl = document.documentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }

      const orientation = screen.orientation as unknown as {
        lock?: (orientation: string) => Promise<void>;
      };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // 某些浏览器（如 iOS Safari）不支持 orientation.lock，优雅降级
    }
  }

  public async toggleFullscreen(): Promise<void> {
    const isFs = !!(
      document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
    );
    if (!isFs) {
      await this.requestFullscreenAndLockLandscape();
    } else {
      try {
        const doc = document as unknown as {
          exitFullscreen?: () => Promise<void>;
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {}
    }
    this.updateFullscreenUI();
  }

  private updateFullscreenUI(): void {
    const isFs = !!(
      document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
    );

    const syncButtons = (btn: HTMLElement | null) => {
      if (!btn) return;
      const enterIcon = btn.querySelector('.icon-fs-enter');
      const exitIcon = btn.querySelector('.icon-fs-exit');
      if (enterIcon && exitIcon) {
        if (isFs) {
          enterIcon.classList.add('hidden');
          exitIcon.classList.remove('hidden');
          btn.setAttribute('title', '退出全屏');
        } else {
          enterIcon.classList.remove('hidden');
          exitIcon.classList.add('hidden');
          btn.setAttribute('title', '全屏模式');
        }
      }
    };

    syncButtons(this.hudFullscreenBtn);
    syncButtons(this.menuFullscreenBtn);
  }
}
