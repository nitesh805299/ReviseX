import express from 'express';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';

const wrapperApp = express();
let dbReadyPromise = null;

wrapperApp.use(async (_req, _res, next) => {
  try {
    if (!dbReadyPromise) {
      dbReadyPromise = connectDatabase().catch((err) => {
        dbReadyPromise = null;
        throw err;
      });
    }
    await dbReadyPromise;
    next();
  } catch (err) {
    next(err);
  }
});

wrapperApp.use(createApp());

export default wrapperApp;
