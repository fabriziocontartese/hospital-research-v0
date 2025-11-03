const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // email
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // phone
  /\b\d{2,3}[-.\s]?\d{2,3}[-.\s]?\d{2,3}[-.\s]?\d{2,4}\b/, // generic numeric id
  /\b\d{3}-\d{2}-\d{4}\b/, // ssn-like
];

const DENYLIST_KEYS = ['name', 'email', 'phone', 'address'];

const containsPII = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return false;
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  return PII_PATTERNS.some((pattern) => pattern.test(stringValue));
};

const ensureAnswersSafe = (answers) => {
  const inspect = (key, value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => inspect(key, entry));
      return;
    }

    const lowered = key.toLowerCase();
    if (DENYLIST_KEYS.some((denied) => lowered.includes(denied))) {
      const error = new Error(`Field ${key} not permitted`);
      error.status = 400;
      throw error;
    }
    if (containsPII(value)) {
      const error = new Error('Potential identifier detected in answers');
      error.status = 400;
      throw error;
    }
  };

  Object.entries(answers || {}).forEach(([key, value]) => inspect(key, value));
};

const ensureAnswersMatchSchema = (answers, schema) => {
  const schemaMap = new Map(schema.items.map((item) => [item.linkId, item]));

  Object.entries(answers || {}).forEach(([linkId, value]) => {
    if (!schemaMap.has(linkId)) {
      const error = new Error(`Unknown linkId ${linkId}`);
      error.status = 400;
      throw error;
    }

    const item = schemaMap.get(linkId);
    switch (item.type) {
      case 'text':
        if (typeof value !== 'string') {
          const error = new Error(`Expected string for ${linkId}`);
          error.status = 400;
          throw error;
        }
        break;
      case 'dropdown':
        if (typeof value !== 'string') {
          const error = new Error(`Expected single selection for ${linkId}`);
          error.status = 400;
          throw error;
        }
        if (!item.options?.includes(value)) {
          const error = new Error(`Selection for ${linkId} not allowed`);
          error.status = 400;
          throw error;
        }
        break;
      case 'checkboxes':
        if (!Array.isArray(value)) {
          const error = new Error(`Expected array for ${linkId}`);
          error.status = 400;
          throw error;
        }
        if (!value.every((entry) => typeof entry === 'string')) {
          const error = new Error(`Each selection for ${linkId} must be text`);
          error.status = 400;
          throw error;
        }
        if (item.options) {
          const unknown = value.filter((entry) => !item.options.includes(entry));
          if (unknown.length) {
            const error = new Error(`Selections [${unknown.join(', ')}] not allowed for ${linkId}`);
            error.status = 400;
            throw error;
          }
        }
        break;
      case 'scale':
        if (typeof value !== 'number') {
          const error = new Error(`Expected numeric value for ${linkId}`);
          error.status = 400;
          throw error;
        }
        if (item.scale) {
          const { min, max } = item.scale;
          if (value < min || value > max) {
            const error = new Error(`Value for ${linkId} must be between ${min} and ${max}`);
            error.status = 400;
            throw error;
          }
        }
        break;
      default:
        {
          const error = new Error(`Unsupported field type for ${linkId}`);
          error.status = 400;
          throw error;
        }
    }
  });
};

module.exports = {
  ensureAnswersSafe,
  ensureAnswersMatchSchema,
};
