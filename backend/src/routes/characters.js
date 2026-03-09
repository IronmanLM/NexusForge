import { Router } from 'express';
import {
  canUserReadCharacter,
  canUserWriteCharacter,
  createCharacter,
  deleteCharacter,
  getCharacterById,
  listCharactersForUser,
  updateCharacter
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';
import { sendError } from '../utils/errors.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const systemId = req.query.systemId?.toString();
  const items = listCharactersForUser(req.auth.user.id, { systemId });
  return res.json({ items });
});

router.post('/', (req, res) => {
  const { systemId, name } = req.body ?? {};
  if (!systemId || !name) {
    return sendError(res, 400, 'INVALID_CHARACTER_PAYLOAD', 'systemId and name are required');
  }

  const character = createCharacter(req.body ?? {}, req.auth.user.id);
  if (character?.error === 'duplicate_character_id') {
    return sendError(res, 409, 'CHARACTER_ID_CONFLICT', 'Character id already exists', {
      characterId: req.body?.id
    });
  }
  return res.status(201).json({ character });
});

router.get('/:characterId', (req, res) => {
  const character = getCharacterById(req.params.characterId);
  if (!character) {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (!canUserReadCharacter(req.auth.user.id, character)) {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }
  return res.json({ character });
});

router.patch('/:characterId', (req, res) => {
  const character = getCharacterById(req.params.characterId);
  if (!character) {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (!canUserWriteCharacter(req.auth.user.id, character)) {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }

  const patch = {};
  if (req.body?.name !== undefined) patch.name = req.body.name;
  if (req.body?.portraitUrl !== undefined) patch.portraitUrl = req.body.portraitUrl;
  if (req.body?.data !== undefined) patch.data = req.body.data;

  const updated = updateCharacter(character.id, patch);
  return res.json({ character: updated });
});

router.delete('/:characterId', (req, res) => {
  const character = getCharacterById(req.params.characterId);
  if (!character) {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (!canUserWriteCharacter(req.auth.user.id, character)) {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }

  const removed = deleteCharacter(character.id);
  if (!removed) {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  return res.status(204).send();
});

export default router;
