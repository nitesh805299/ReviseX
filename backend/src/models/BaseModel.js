import crypto from 'node:crypto';
import { query } from '../config/db.js';

const hiddenFields = new Set(['passwordHash', 'resetTokenHash', 'resetTokenExpiresAt']);

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function encodeValue(model, field, value) {
  return model.jsonFields.includes(field) ? JSON.stringify(value) : value;
}

function parameter(model, field, value, values) {
  values.push(encodeValue(model, field, value));
  const index = values.length;
  return model.jsonFields.includes(field) ? `$${index}::jsonb` : `$${index}`;
}

function compileWhere(model, filter, values) {
  const clauses = [];

  for (const [field, condition] of Object.entries(filter || {})) {
    if (field === '$or') {
      if (!Array.isArray(condition) || condition.length === 0) {
        throw new Error('Invalid database filter: $or must contain conditions.');
      }
      clauses.push(
        `(${condition.map((item) => compileWhere(model, item, values)).join(' OR ')})`
      );
      continue;
    }

    if (!model.columns.includes(field)) {
      throw new Error(`Unknown ${model.name} database field: ${field}`);
    }

    const column = quote(field);
    if (condition === null) {
      clauses.push(`${column} IS NULL`);
    } else if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
      for (const [operator, value] of Object.entries(condition)) {
        if (operator === '$regex') {
          const searchText = String(value).replace(/[\\%_]/g, '\\$&');
          const pattern = parameter(model, field, `%${searchText}%`, values);
          const caseInsensitive = condition.$options?.includes('i');
          clauses.push(`${column} ${caseInsensitive ? 'ILIKE' : 'LIKE'} ${pattern}`);
        } else if (operator === '$gt') {
          clauses.push(`${column} > ${parameter(model, field, value, values)}`);
        } else if (operator === '$in') {
          if (!Array.isArray(value) || value.length === 0) {
            clauses.push('FALSE');
          } else {
            clauses.push(
              `${column} IN (${value.map((item) => parameter(model, field, item, values)).join(', ')})`
            );
          }
        } else if (operator === '$ne') {
          if (value === null) {
            clauses.push(`${column} IS NOT NULL`);
          } else {
            clauses.push(`${column} <> ${parameter(model, field, value, values)}`);
          }
        } else if (operator !== '$options') {
          throw new Error(`Unsupported database filter operator: ${operator}`);
        }
      }
    } else {
      clauses.push(`${column} = ${parameter(model, field, condition, values)}`);
    }
  }

  return clauses.join(' AND ') || 'TRUE';
}

function getUpdateValues(model, update) {
  const values = { ...(update.$set || {}) };
  for (const [field, amount] of Object.entries(update.$inc || {})) {
    if (!model.columns.includes(field) || field === '_id') {
      throw new Error(`Unknown ${model.name} database field: ${field}`);
    }
    values[field] = { __increment: amount };
  }
  for (const [field, value] of Object.entries(update)) {
    if (!field.startsWith('$')) values[field] = value;
  }
  return values;
}

export class ModelQuery {
  constructor(model, filter, single = false) {
    this.model = model;
    this.filter = filter;
    this.single = single;
    this.sortBy = null;
    this.selection = null;
    this.asPlainObject = false;
  }

  sort(sortBy) {
    this.sortBy = sortBy;
    return this;
  }

  select(selection) {
    this.selection = selection;
    return this;
  }

  lean() {
    this.asPlainObject = true;
    return this;
  }

  async execute() {
    const values = [];
    const where = compileWhere(this.model, this.filter, values);
    const columns = this.model.getSelectedColumns(this.selection);
    const orderBy = Object.entries(this.sortBy || {})
      .map(([field, direction]) => {
        if (!this.model.columns.includes(field)) {
          throw new Error(`Unknown ${this.model.name} sort field: ${field}`);
        }
        return `${quote(field)} ${Number(direction) < 0 ? 'DESC' : 'ASC'}`;
      })
      .join(', ');
    const limit = this.single ? ' LIMIT 1' : '';
    const result = await query(
      `SELECT ${columns.map(quote).join(', ')} FROM ${quote(this.model.tableName)} WHERE ${where}${
        orderBy ? ` ORDER BY ${orderBy}` : ''
      }${limit}`,
      values
    );
    const rows = result.rows.map((row) =>
      this.asPlainObject ? row : this.model.hydrate(row, Boolean(this.selection))
    );
    return this.single ? rows[0] || null : rows;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }
}

export class BaseModel {
  static jsonFields = [];
  static defaults = {};

  constructor(values = {}, selected = false) {
    Object.assign(this, values);
    Object.defineProperty(this, '_selectedFields', { value: selected, writable: true });
  }

  toJSON() {
    return Object.fromEntries(
      Object.entries(this).filter(([field]) => !field.startsWith('_internal'))
    );
  }

  async save() {
    if (!this._id) {
      throw new Error(`${this.constructor.name} cannot be saved without an ID.`);
    }
    const updates = Object.fromEntries(
      Object.entries(this).filter(
        ([field, value]) =>
          this.constructor.columns.includes(field) &&
          field !== '_id' &&
          field !== 'createdAt' &&
          field !== 'updatedAt' &&
          value !== undefined
      )
    );
    const result = await this.constructor.updateById(this._id, updates);
    if (!result) throw new Error(`${this.constructor.name} record no longer exists.`);
    Object.assign(this, result);
    return this;
  }

  static getSelectedColumns(selection) {
    const fields = this.columns.filter((field) => !hiddenFields.has(field));
    if (!selection) return fields;

    const tokens = String(selection).trim().split(/\s+/).filter(Boolean);
    const included = tokens.filter((token) => !token.startsWith('+'));
    if (included.length > 0) {
      return [...new Set(['_id', ...included, ...tokens.filter((token) => token.startsWith('+')).map((token) => token.slice(1))])]
        .filter((field) => this.columns.includes(field));
    }

    for (const token of tokens) {
      if (token.startsWith('+') && this.columns.includes(token.slice(1))) {
        fields.push(token.slice(1));
      }
    }
    return [...new Set(fields)];
  }

  static hydrate(row, selected = false) {
    return new this(row, selected);
  }

  static find(filter = {}) {
    return new ModelQuery(this, filter);
  }

  static findOne(filter = {}) {
    return new ModelQuery(this, filter, true);
  }

  static findById(id) {
    return this.findOne({ _id: id });
  }

  static async create(values) {
    const now = new Date();
    const record = {
      ...this.defaults,
      ...values,
      _id: values._id || crypto.randomUUID(),
      createdAt: values.createdAt || now,
      updatedAt: values.updatedAt || now,
    };
    const fields = Object.keys(record).filter(
      (field) => this.columns.includes(field) && record[field] !== undefined
    );
    const valuesForQuery = fields.map((field) => encodeValue(this, field, record[field]));
    const placeholders = fields.map((field, index) =>
      this.jsonFields.includes(field) ? `$${index + 1}::jsonb` : `$${index + 1}`
    );
    const result = await query(
      `INSERT INTO ${quote(this.tableName)} (${fields.map(quote).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valuesForQuery
    );
    return this.hydrate(result.rows[0]);
  }

  static async insertMany(records) {
    const inserted = [];
    for (const record of records) inserted.push(await this.create(record));
    return inserted;
  }

  static async findOneAndUpdate(filter, update, options = {}) {
    const updates = getUpdateValues(this, update);
    if (options.upsert && this.upsertKeys?.every((field) => filter[field] !== undefined)) {
      const base = Object.fromEntries(this.upsertKeys.map((field) => [field, filter[field]]));
      const now = new Date();
      const record = {
        ...this.defaults,
        ...base,
        ...updates,
        _id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      const fields = Object.keys(record).filter(
        (field) => this.columns.includes(field) && record[field] !== undefined
      );
      const values = fields.map((field) => encodeValue(this, field, record[field]));
      const placeholders = fields.map((field, index) =>
        this.jsonFields.includes(field) ? `$${index + 1}::jsonb` : `$${index + 1}`
      );
      const updateFields = Object.keys(updates).filter(
        (field) => field !== '_id' && field !== 'createdAt'
      );
      const assignments = updateFields.length
        ? updateFields.map((field) => `${quote(field)} = EXCLUDED.${quote(field)}`)
        : ['"updatedAt" = NOW()'];
      assignments.push('"updatedAt" = NOW()');
      const result = await query(
        `INSERT INTO ${quote(this.tableName)} (${fields.map(quote).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${this.upsertKeys.map(quote).join(', ')}) DO UPDATE SET ${[...new Set(assignments)].join(', ')} RETURNING *`,
        values
      );
      return this.hydrate(result.rows[0]);
    }

    let existing = await this.findOne(filter);
    if (!existing && options.upsert) {
      const base = Object.fromEntries(
        Object.entries(filter).filter(([, value]) => value === null || typeof value !== 'object')
      );
      existing = await this.create({ ...base, ...updates });
      return existing;
    }
    if (!existing) return null;
    const updated = await this.updateById(existing._id, updates);
    return updated;
  }

  static async updateById(id, updates) {
    return this.updateOne({ _id: id }, updates);
  }

  static async findByIdAndUpdate(id, update) {
    const values = getUpdateValues(this, update);
    return this.updateById(id, values);
  }

  static async updateOne(filter, update) {
    const updates = getUpdateValues(this, update);
    const values = [];
    const assignments = Object.entries(updates).map(([field, value]) => {
      if (!this.columns.includes(field) || field === '_id') {
        throw new Error(`Unknown ${this.name} database field: ${field}`);
      }
      if (value && typeof value === 'object' && '__increment' in value) {
        values.push(value.__increment);
        return `${quote(field)} = ${quote(field)} + $${values.length}`;
      }
      return `${quote(field)} = ${parameter(this, field, value, values)}`;
    });
    if (this.columns.includes('updatedAt')) assignments.push('"updatedAt" = NOW()');
    const where = compileWhere(this, filter, values);
    const result = await query(
      `UPDATE ${quote(this.tableName)} SET ${assignments.join(', ')} WHERE ${where} RETURNING *`,
      values
    );
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  static async updateMany(filter, update) {
    const updates = getUpdateValues(this, update);
    const values = [];
    const assignments = Object.entries(updates).map(([field, value]) => {
      if (!this.columns.includes(field) || field === '_id') {
        throw new Error(`Unknown ${this.name} database field: ${field}`);
      }
      if (value && typeof value === 'object' && '__increment' in value) {
        values.push(value.__increment);
        return `${quote(field)} = ${quote(field)} + $${values.length}`;
      }
      return `${quote(field)} = ${parameter(this, field, value, values)}`;
    });
    if (this.columns.includes('updatedAt')) assignments.push('"updatedAt" = NOW()');
    const where = compileWhere(this, filter, values);
    const result = await query(
      `UPDATE ${quote(this.tableName)} SET ${assignments.join(', ')} WHERE ${where}`,
      values
    );
    return { modifiedCount: result.rowCount };
  }

  static async deleteOne(filter) {
    const values = [];
    const where = compileWhere(this, filter, values);
    const result = await query(
      `DELETE FROM ${quote(this.tableName)} WHERE ${where} RETURNING "_id"`,
      values
    );
    return { deletedCount: result.rowCount };
  }

  static async deleteMany(filter) {
    return this.deleteOne(filter);
  }

  static async countDocuments(filter = {}) {
    const values = [];
    const where = compileWhere(this, filter, values);
    const result = await query(
      `SELECT COUNT(*)::integer AS "count" FROM ${quote(this.tableName)} WHERE ${where}`,
      values
    );
    return result.rows[0].count;
  }
}
