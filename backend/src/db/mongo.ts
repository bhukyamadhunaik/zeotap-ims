import mongoose from 'mongoose';

export const initMongo = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/ims';
  await mongoose.connect(uri);
  console.log('MongoDB initialized');
};

const signalSchema = new mongoose.Schema({
  component_id: { type: String, required: true },
  payload: { type: Object, required: true },
  timestamp: { type: Date, default: Date.now },
  work_item_id: { type: Number, required: false }
});

export const SignalModel = mongoose.model('Signal', signalSchema);
