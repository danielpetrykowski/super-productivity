import { DBNames, SyncProviderId } from '../pfapi.const';
import { Database } from '../db/database';
import { PFLog } from '../../../core/log';
import { PFEventEmitter } from '../util/events';
import { PrivateCfgByProviderId } from '../pfapi.model';

/**
 * Store for managing sync provider private configuration
 * Handles persistence and change notifications
 */
export class SyncProviderPrivateCfgStore<PID extends SyncProviderId> {
  private static readonly L = 'SyncProviderPrivateCfgStore';
  public static readonly DB_KEY_PREFIX = DBNames.PrivateCfgStorePrefix;

  private readonly _dbKey: string;
  private _privateCfgInMemory?: PrivateCfgByProviderId<PID>;

  constructor(
    private readonly _providerId: PID,
    private readonly _db: Database,
    private readonly _ev: PFEventEmitter,
  ) {
    this._dbKey = SyncProviderPrivateCfgStore.DB_KEY_PREFIX + _providerId;
  }

  /**
   * Loads the provider's private configuration
   * @returns The private configuration or null if not found
   * @throws Error if database load operation fails
   */
  async load(): Promise<PrivateCfgByProviderId<PID> | null> {
    PFLog.verbose(
      `${SyncProviderPrivateCfgStore.L}.${this.load.name}`,
      this._privateCfgInMemory,
    );

    // Return cached config if available
    if (this._privateCfgInMemory) {
      return this._privateCfgInMemory;
    }

    try {
      const loadedConfig = (await this._db.load(
        this._dbKey,
      )) as PrivateCfgByProviderId<PID>;
      if (loadedConfig) {
        this._privateCfgInMemory = loadedConfig;
      }
      return loadedConfig;
    } catch (error) {
      PFLog.critical(`Failed to load private config: ${error}`);
      throw new Error(`Failed to load private config: ${error}`);
    }
  }

  /**
   * Saves the provider's private configuration
   * @param privateCfg Configuration to save
   * @returns Promise resolving after save completes
   * @throws Error if database save operation fails
   */
  async save(privateCfg: PrivateCfgByProviderId<PID>): Promise<unknown> {
    const key = this._providerId;
    PFLog.normal(`${SyncProviderPrivateCfgStore.L}.${this.save.name}()`, key, privateCfg);

    this._privateCfgInMemory = privateCfg;

    // Emit configuration change event
    this._ev.emit('providerPrivateCfgChange', {
      providerId: this._providerId,
      privateCfg,
    });

    try {
      // NOTE we always want to ignore DB lock during sync as it is unrelated to sync data in every single case
      return await this._db.save(this._dbKey, privateCfg, true);
    } catch (error) {
      PFLog.critical(`Failed to save private config: ${error}`);
      throw new Error(`Failed to save private config: ${error}`);
    }
  }
}
