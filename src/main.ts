import {
  enableProdMode,
  ErrorHandler,
  importProvidersFrom,
  LOCALE_ID,
  provideExperimentalZonelessChangeDetection,
  SecurityContext,
} from '@angular/core';

import { environment } from './environments/environment';
import { IS_ELECTRON, LanguageCode } from './app/app.constants';
import { IS_ANDROID_WEB_VIEW } from './app/util/is-android-web-view';
import { androidInterface } from './app/features/android/android-interface';
import { ElectronAPI } from '../electron/electronAPI.d';
import { App as CapacitorApp } from '@capacitor/app';
import { GlobalErrorHandler } from './app/core/error-handler/global-error-handler.class';
import {
  bootstrapApplication,
  BrowserModule,
  HAMMER_GESTURE_CONFIG,
  HammerModule,
} from '@angular/platform-browser';
import { MyHammerConfig } from './hammer-config.class';
import {
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { MarkdownModule, MARKED_OPTIONS, provideMarkdown } from 'ngx-markdown';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { FeatureStoresModule } from './app/root-store/feature-stores.module';
import { MatNativeDateModule } from '@angular/material/core';
import { FormlyConfigModule } from './app/ui/formly-config.module';
import { markedOptionsFactory } from './app/ui/marked-options-factory';
import { MaterialCssVarsModule } from 'angular-material-css-vars';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ReminderModule } from './app/features/reminder/reminder.module';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  PreloadAllModules,
  provideRouter,
  withHashLocation,
  withPreloading,
} from '@angular/router';
import { APP_ROUTES } from './app/app.routes';
import { StoreModule } from '@ngrx/store';
import { reducers } from './app/root-store';
import { undoTaskDeleteMetaReducer } from './app/root-store/meta/undo-task-delete.meta-reducer';
import { actionLoggerReducer } from './app/root-store/meta/action-logger.reducer';
import {
  plannerSharedMetaReducer,
  projectSharedMetaReducer,
  tagSharedMetaReducer,
  taskSharedCrudMetaReducer,
  taskBatchUpdateMetaReducer,
  taskSharedLifecycleMetaReducer,
  taskSharedSchedulingMetaReducer,
} from './app/root-store/meta/task-shared-meta-reducers';
import { EffectsModule } from '@ngrx/effects';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { ReactiveFormsModule } from '@angular/forms';
import { ServiceWorkerModule } from '@angular/service-worker';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { AppComponent } from './app/app.component';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { ShortTime2Pipe } from './app/ui/pipes/short-time2.pipe';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { promiseTimeout } from './app/util/promise-timeout';
import { PLUGIN_INITIALIZER_PROVIDER } from './app/plugins/plugin-initializer';
import { initializeMatMenuTouchFix } from './app/features/tasks/task-context-menu/mat-menu-touch-monkey-patch';
import { Log } from './app/core/log';

if (environment.production || environment.stage) {
  enableProdMode();
}

declare global {
  interface Window {
    ea: ElectronAPI;
  }
}

const createTranslateLoader = (http: HttpClient): TranslateHttpLoader =>
  new TranslateHttpLoader(http, './assets/i18n/', '.json');

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      FeatureStoresModule,
      MatNativeDateModule,
      FormlyConfigModule,
      MarkdownModule.forRoot({
        markedOptions: {
          provide: MARKED_OPTIONS,
          useFactory: markedOptionsFactory,
        },
        sanitize: SecurityContext.HTML,
      }),
      MaterialCssVarsModule.forRoot(),
      MatSidenavModule,
      ReminderModule,
      MaterialCssVarsModule.forRoot(),
      // External
      BrowserModule,
      HammerModule,
      // NOTE: both need to be present to use forFeature stores
      StoreModule.forRoot(reducers, {
        metaReducers: [
          undoTaskDeleteMetaReducer,
          taskSharedCrudMetaReducer,
          taskBatchUpdateMetaReducer,
          taskSharedLifecycleMetaReducer,
          taskSharedSchedulingMetaReducer,
          projectSharedMetaReducer,
          tagSharedMetaReducer,
          plannerSharedMetaReducer,
          actionLoggerReducer,
        ],
        ...(environment.production
          ? {
              runtimeChecks: {
                strictStateImmutability: false,
                strictActionImmutability: false,
                strictStateSerializability: false,
                strictActionSerializability: false,
              },
            }
          : {
              runtimeChecks: {
                strictStateImmutability: true,
                strictActionImmutability: true,
                strictStateSerializability: true,
                strictActionSerializability: true,
                strictActionTypeUniqueness: true,
              },
            }),
      }),
      EffectsModule.forRoot([]),
      !environment.production && !environment.stage
        ? StoreDevtoolsModule.instrument()
        : [],
      ReactiveFormsModule,
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled:
          !IS_ELECTRON &&
          !IS_ANDROID_WEB_VIEW &&
          (environment.production || environment.stage),
        // Register the ServiceWorker as soon as the application is stable
        // or after 30 seconds (whichever comes first).
        registrationStrategy: 'registerWhenStable:30000',
      }),
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: createTranslateLoader,
          deps: [HttpClient],
        },
      }),
      CdkDropListGroup,
    ),
    {
      provide: LOCALE_ID,
      // useValue: 'en-US', // to simulate other language
      useValue: Object.values(LanguageCode).includes(
        (navigator.language.split('-')[0] || navigator.language) as LanguageCode,
      )
        ? navigator.language
        : 'en-US',
    },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: HAMMER_GESTURE_CONFIG, useClass: MyHammerConfig },
    provideHttpClient(withInterceptorsFromDi()),
    // TODO check if these can be removed
    DatePipe,
    ShortTime2Pipe,
    provideCharts(withDefaultRegisterables()),
    provideMarkdown(),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'fill', subscriptSizing: 'dynamic' },
    },
    provideAnimations(),
    provideRouter(APP_ROUTES, withHashLocation(), withPreloading(PreloadAllModules)),
    PLUGIN_INITIALIZER_PROVIDER,
    provideExperimentalZonelessChangeDetection(),
  ],
}).then(() => {
  // Initialize touch fix for Material menus
  initializeMatMenuTouchFix();

  // TODO make asset caching work for electron

  if (
    'serviceWorker' in navigator &&
    (environment.production || environment.stage) &&
    !IS_ELECTRON &&
    !IS_ANDROID_WEB_VIEW
  ) {
    Log.log('Registering Service worker');
    return navigator.serviceWorker.register('ngsw-worker.js').catch((err: any) => {
      Log.log('Service Worker Registration Error');
      Log.err(err);
    });
  } else if ('serviceWorker' in navigator && (IS_ELECTRON || IS_ANDROID_WEB_VIEW)) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      })
      .catch((e) => {
        Log.err('ERROR when unregistering service worker');
        Log.err(e);
      });
  }
  return undefined;
});

// fix mobile scrolling while dragging
window.addEventListener('touchmove', () => {});

if (!(environment.production || environment.stage) && IS_ANDROID_WEB_VIEW) {
  setTimeout(() => {
    androidInterface.showToast('Android DEV works');
    Log.log(androidInterface);
  }, 1000);
}

// CAPICATOR STUFF
// ---------------
if (IS_ANDROID_WEB_VIEW) {
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (!canGoBack) {
      CapacitorApp.minimizeApp();
    } else {
      window.history.back();
    }
  });

  CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) {
      return;
    }
    // The app state has been changed to inactive.
    // Start the background task by calling `beforeExit`.
    const taskId = await BackgroundTask.beforeExit(async () => {
      // Run your code...
      // Finish the background task as soon as everything is done.
      Log.log('Time window for completing sync started');
      await promiseTimeout(20000);
      Log.log('Time window for completing sync ended. Closing app!');
      BackgroundTask.finish({ taskId });
    });
  });
}
