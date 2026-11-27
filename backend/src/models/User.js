import { BaseModel } from './BaseModel.js';

export class User extends BaseModel {
  static tableName = 'users';
  static columns = [
    '_id',
    'name',
    'email',
    'passwordHash',
    'profileImage',
    'resetTokenHash',
    'resetTokenExpiresAt',
    'createdAt',
    'updatedAt',
  ];
  static defaults = {
    profileImage: '',
    resetTokenHash: null,
    resetTokenExpiresAt: null,
  };

  toSafeJSON() {
    return {
      id: this._id,
      name: this.name,
      email: this.email,
      profileImage: this.profileImage,
      createdAt: this.createdAt,
    };
  }
}
