import { BaseModel } from './BaseModel.js';

export class Change extends BaseModel {
  static tableName = 'changes';
  static columns = [
    '_id',
    'projectId',
    'pageId',
    'pageUrl',
    'clientId',
    'elementId',
    'elementFingerprint',
    'type',
    'originalValue',
    'proposedValue',
    'revisionId',
    'unresolved',
    'unresolvedReason',
    'createdAt',
    'updatedAt',
  ];
  static jsonFields = ['elementFingerprint', 'originalValue', 'proposedValue'];
  static defaults = {
    pageId: null,
    clientId: null,
    originalValue: null,
    revisionId: null,
    unresolved: false,
    unresolvedReason: null,
  };
}
