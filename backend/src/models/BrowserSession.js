import { BaseModel } from './BaseModel.js';

export class BrowserSession extends BaseModel {
  static tableName = 'browser_sessions';
  static columns = [
    '_id',
    'projectId',
    'ownerId',
    'workerSessionId',
    'currentUrl',
    'viewport',
    'sessionStatus',
    'expiresAt',
    'createdAt',
    'updatedAt',
  ];
  static defaults = {
    viewport: 'desktop',
    sessionStatus: 'active',
  };
}
