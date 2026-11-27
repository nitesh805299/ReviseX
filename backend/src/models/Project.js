import { BaseModel } from './BaseModel.js';

export class Project extends BaseModel {
  static tableName = 'projects';
  static columns = [
    '_id',
    'ownerId',
    'name',
    'originalUrl',
    'status',
    'thumbnail',
    'lastError',
    'changesCount',
    'activeRevisionNumber',
    'createdAt',
    'updatedAt',
  ];
  static defaults = {
    status: 'active',
    thumbnail: '',
    lastError: null,
    changesCount: 0,
    activeRevisionNumber: 0,
  };
}
