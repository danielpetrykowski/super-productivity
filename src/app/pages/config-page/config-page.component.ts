import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { GlobalConfigService } from '../../features/config/global-config.service';
import {
  GLOBAL_CONFIG_FORM_CONFIG,
  GLOBAL_IMEX_FORM_CONFIG,
  GLOBAL_PRODUCTIVITY_FORM_CONFIG,
} from '../../features/config/global-config-form-config.const';
import {
  ConfigFormConfig,
  GlobalConfigSectionKey,
  GlobalConfigState,
  GlobalSectionConfig,
} from '../../features/config/global-config.model';
import { combineLatest, Observable, Subscription } from 'rxjs';
import { ProjectCfgFormKey } from '../../features/project/project.model';
import { T } from '../../t.const';
import { versions } from '../../../environments/versions';
import { IS_ELECTRON } from '../../app.constants';
import { IS_ANDROID_WEB_VIEW } from '../../util/is-android-web-view';
import { getAutomaticBackUpFormCfg } from '../../features/config/form-cfgs/automatic-backups-form.const';
import { getAppVersionStr } from '../../util/get-app-version-str';
import { ConfigSectionComponent } from '../../features/config/config-section/config-section.component';
import { ConfigSoundFormComponent } from '../../features/config/config-sound-form/config-sound-form.component';
import { TranslatePipe } from '@ngx-translate/core';
import { SYNC_FORM } from '../../features/config/form-cfgs/sync-form.const';
import { PfapiService } from '../../pfapi/pfapi.service';
import { map, tap } from 'rxjs/operators';
import { SyncConfigService } from '../../imex/sync/sync-config.service';
import { AsyncPipe } from '@angular/common';
import { PluginManagementComponent } from '../../plugins/ui/plugin-management/plugin-management.component';
import { CollapsibleComponent } from '../../ui/collapsible/collapsible.component';
import { PluginBridgeService } from '../../plugins/plugin-bridge.service';
import { createPluginShortcutFormItems } from '../../features/config/form-cfgs/plugin-keyboard-shortcuts';
import { PluginShortcutCfg } from '../../plugins/plugin-api.model';
import { ThemeSelectorComponent } from '../../core/theme/theme-selector/theme-selector.component';
import { Log } from '../../core/log';
import { downloadLogs } from '../../util/download';
import { SnackService } from '../../core/snack/snack.service';
import { SyncWrapperService } from '../../imex/sync/sync-wrapper.service';

@Component({
  selector: 'config-page',
  templateUrl: './config-page.component.html',
  styleUrls: ['./config-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ThemeSelectorComponent,
    ConfigSectionComponent,
    ConfigSoundFormComponent,
    TranslatePipe,
    AsyncPipe,
    PluginManagementComponent,
    CollapsibleComponent,
  ],
})
export class ConfigPageComponent implements OnInit, OnDestroy {
  private readonly _cd = inject(ChangeDetectorRef);
  private readonly _pfapiService = inject(PfapiService);
  readonly configService = inject(GlobalConfigService);
  readonly syncSettingsService = inject(SyncConfigService);
  private readonly _syncWrapperService = inject(SyncWrapperService);
  private readonly _pluginBridgeService = inject(PluginBridgeService);
  private readonly _snackService = inject(SnackService);

  T: typeof T = T;
  globalConfigFormCfg: ConfigFormConfig;
  globalImexFormCfg: ConfigFormConfig;
  globalProductivityConfigFormCfg: ConfigFormConfig;
  globalSyncConfigFormCfg = {
    ...SYNC_FORM,
    items: [
      ...SYNC_FORM.items!,
      {
        hideExpression: (m, v, field) => !m.isEnabled || !field?.form?.valid,
        key: '___',
        type: 'btn',
        className: 'mt3 block',
        templateOptions: {
          text: T.F.SYNC.BTN_SYNC_NOW,
          required: false,
          onClick: () => {
            this._syncWrapperService.sync();
          },
        },
      },
    ],
  };

  globalCfg?: GlobalConfigState;

  appVersion: string = getAppVersionStr();
  versions?: any = versions;

  // TODO needs to contain all sync providers....
  // TODO maybe handling this in an effect would be better????
  syncFormCfg$: Observable<any> = combineLatest([
    this._pfapiService.currentProviderPrivateCfg$,
    this.configService.sync$,
  ])
    .pipe(
      map(([currentProviderCfg, syncCfg]) => {
        if (!currentProviderCfg) {
          return syncCfg;
        }
        return {
          ...syncCfg,
          [currentProviderCfg.providerId]: currentProviderCfg.privateCfg,
        };
      }),
    )
    .pipe(tap((v) => Log.log('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXA', v)));

  private _subs: Subscription = new Subscription();

  constructor() {
    // somehow they are only unproblematic if assigned here
    this.globalConfigFormCfg = GLOBAL_CONFIG_FORM_CONFIG.slice();
    this.globalImexFormCfg = GLOBAL_IMEX_FORM_CONFIG.slice();
    this.globalProductivityConfigFormCfg = GLOBAL_PRODUCTIVITY_FORM_CONFIG.slice();

    // NOTE: needs special handling cause of the async stuff
    if (IS_ANDROID_WEB_VIEW) {
      this.globalImexFormCfg = [...this.globalImexFormCfg, getAutomaticBackUpFormCfg()];
    } else if (IS_ELECTRON) {
      window.ea.getBackupPath().then((backupPath) => {
        this.globalImexFormCfg = [
          ...this.globalImexFormCfg,
          getAutomaticBackUpFormCfg(backupPath),
        ];
        this._cd.detectChanges();
      });
    }
  }

  ngOnInit(): void {
    this._subs.add(
      this.configService.cfg$.subscribe((cfg) => {
        this.globalCfg = cfg;
        // this._cd.detectChanges();
      }),
    );

    // Subscribe to plugin shortcuts changes for live updates
    this._subs.add(
      this._pluginBridgeService.shortcuts$.subscribe((shortcuts) => {
        Log.log('Plugin shortcuts changed:', { shortcuts });
        this._updateKeyboardFormWithPluginShortcuts(shortcuts);
      }),
    );
  }

  private _updateKeyboardFormWithPluginShortcuts(shortcuts: PluginShortcutCfg[]): void {
    // Find keyboard form section
    const keyboardFormIndex = this.globalConfigFormCfg.findIndex(
      (section) => section.key === 'keyboard',
    );

    if (keyboardFormIndex === -1) {
      Log.err('Keyboard form section not found');
      return;
    }

    const keyboardSection = this.globalConfigFormCfg[keyboardFormIndex];

    // Remove existing plugin shortcuts and header from the form
    const filteredItems = (keyboardSection.items || []).filter((item) => {
      // Remove plugin shortcut items
      if (item.key?.toString().startsWith('plugin_')) {
        return false;
      }
      // Remove plugin shortcuts header
      if (
        item.type === 'tpl' &&
        item.templateOptions?.text ===
          (T.GCF.KEYBOARD.PLUGIN_SHORTCUTS || 'Plugin Shortcuts')
      ) {
        return false;
      }
      return true;
    });

    // Add current plugin shortcuts to the form
    let newItems = [...filteredItems];
    if (shortcuts.length > 0) {
      const pluginShortcutItems = createPluginShortcutFormItems(shortcuts);
      newItems = [...filteredItems, ...pluginShortcutItems];
      Log.log(`Updated keyboard form with ${shortcuts.length} plugin shortcuts`);
    } else {
      Log.log('No plugin shortcuts to add to keyboard form');
    }

    // Create a new keyboard section object to trigger change detection
    const newKeyboardSection = {
      ...keyboardSection,
      items: newItems,
    };

    // Create a new config array to ensure Angular detects the change
    this.globalConfigFormCfg = [
      ...this.globalConfigFormCfg.slice(0, keyboardFormIndex),
      newKeyboardSection,
      ...this.globalConfigFormCfg.slice(keyboardFormIndex + 1),
    ];

    // Trigger change detection
    this._cd.detectChanges();
  }

  ngOnDestroy(): void {
    this._subs.unsubscribe();
  }

  saveGlobalCfg($event: {
    sectionKey: GlobalConfigSectionKey | ProjectCfgFormKey;
    config: any;
  }): void {
    const config = $event.config;
    const sectionKey = $event.sectionKey as GlobalConfigSectionKey;

    if (!sectionKey || !config) {
      throw new Error('Not enough data');
    } else {
      this.configService.updateSection(sectionKey, config);
    }
  }

  getGlobalCfgSection(
    sectionKey: GlobalConfigSectionKey | ProjectCfgFormKey,
  ): GlobalSectionConfig {
    return (this.globalCfg as any)[sectionKey];
  }

  async downloadLogs(): Promise<void> {
    try {
      await downloadLogs();
      this._snackService.open('Logs downloaded to android documents folder');
    } catch (error) {
      this._snackService.open('Failed to download logs');
    }
  }
}
