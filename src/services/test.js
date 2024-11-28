const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://slowey:B8tCoWE4IVS5PwBv@congchungonline.qmbna.mongodb.net/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const { StatusTracking } = require('../models');

(async () => {
  const invalidDocuments = await StatusTracking.find({
    $or: [{ updatedAt: { $exists: false } }, { updatedAt: { $type: 'string' } }, { updatedAt: null }],
  });
  console.log('Invalid documents:', invalidDocuments);
})();
