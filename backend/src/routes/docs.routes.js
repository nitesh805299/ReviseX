import express from 'express';

const router = express.Router();

router.get('/docs', (_req, res) => {
  res.json({
    name: 'ReviseX API',
    version: '1.0.0',
    description: 'No-code visual website editing and collaboration platform API',
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'GET /api/auth/me',
        'PATCH /api/auth/me',
        'POST /api/auth/forgot-password',
        'POST /api/auth/reset-password',
      ],
      projects: [
        'POST /api/projects',
        'GET /api/projects',
        'GET /api/projects/:id',
        'PATCH /api/projects/:id',
        'DELETE /api/projects/:id',
      ],
      browser: [
        'POST /api/browser/sessions',
        'GET /api/browser/sessions/:id',
        'POST /api/browser/sessions/:id/navigate',
        'POST /api/browser/sessions/:id/viewport',
        'POST /api/browser/sessions/:id/replay',
        'GET /api/browser/sessions/:id/frame',
        'POST /api/browser/sessions/:id/action',
        'DELETE /api/browser/sessions/:id',
      ],
      changes: [
        'POST /api/projects/:id/changes',
        'GET /api/projects/:id/changes',
        'PATCH /api/changes/:changeId',
        'DELETE /api/changes/:changeId',
      ],
      revisions: [
        'POST /api/projects/:id/revisions',
        'GET /api/projects/:id/revisions',
        'POST /api/projects/:id/revisions/:revisionId/restore',
      ],
      sharing: [
        'POST /api/projects/:id/shares',
        'GET /api/projects/:id/shares',
        'GET /api/shares/:token',
        'DELETE /api/shares/:shareId',
      ],
      assets: [
        'POST /api/assets/upload',
        'GET /api/projects/:id/assets',
        'DELETE /api/assets/:assetId',
      ],
    },
  });
});

export default router;
