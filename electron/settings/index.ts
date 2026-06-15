/**
 * OpenAgent-Desktop Aether - Settings Module
 */

export { validateSetting, validateAllSettings, getSettingDefaults, getSettingsByCategory, getAllCategories, SETTINGS_SCHEMA } from './validator';
export type { SettingConstraint } from './validator';
export { migrateFromV1, isV1Config } from './migrations';
export type { AetherAppConfig } from './migrations';
