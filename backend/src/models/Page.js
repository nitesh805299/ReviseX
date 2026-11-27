import { BaseModel } from './BaseModel.js';

export class Page extends BaseModel {
  static tableName = 'pages';
  static columns = [
    '_id',
    'projectId',
    'originalUrl',
    'title',
    'viewport',
    'snapshotHtml',
    'elements',
    'layers',
    'navLinks',
    'createdAt',
    'updatedAt',
  ];
  static jsonFields = ['viewport', 'elements', 'layers', 'navLinks'];
  static upsertKeys = ['projectId', 'originalUrl'];
  static defaults = {
    title: '',
    viewport: { preset: 'desktop', width: 1440, height: 900 },
    snapshotHtml: '',
    elements: {},
    layers: [],
    navLinks: [],
  };
}
