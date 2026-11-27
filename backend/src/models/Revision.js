import { BaseModel } from './BaseModel.js';

export class Revision extends BaseModel {
  static tableName = 'revisions';
  static columns = [
    '_id',
    'projectId',
    'revisionNumber',
    'label',
    'changes',
    'createdBy',
    'createdAt',
    'updatedAt',
  ];
  static jsonFields = ['changes'];
  static defaults = {
    label: '',
    changes: [],
  };
}
