import Joi from 'joi';
import { Listing } from '../models/Listing.js';

const CATEGORIES = ['textbooks', 'electronics', 'furniture', 'clothing', 'other'];
const CONDITIONS = ['new', 'like-new', 'used', 'worn'];
const objectId = Joi.string().hex().length(24);

// status is not accepted here: it only changes via DELETE (removed) or mark-as-sold.
const createSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().allow(''),
  price: Joi.number().min(0).required(),
  category: Joi.string().valid(...CATEGORIES),
  condition: Joi.string().valid(...CONDITIONS),
  seller: objectId
});

const updateSchema = Joi.object({
  title: Joi.string().trim(),
  description: Joi.string().allow(''),
  price: Joi.number().min(0),
  category: Joi.string().valid(...CATEGORIES),
  condition: Joi.string().valid(...CONDITIONS),
  seller: objectId
}).min(1);

// Removed listings are hidden unless the client asks with ?includeRemoved=true.
function visibleFilter(req) {
  return req.query.includeRemoved === 'true' ? {} : { status: { $ne: 'removed' } };
}

// GET /api/listings
export async function getAllListings(req, res, next) {
  try {
    // populate runs a second query on users; only name/email so the password hash never leaks.
    const listings = await Listing.find(visibleFilter(req))
      .sort({ createdAt: -1 })
      .populate('seller', 'name email');
    res.json({ listings });
  } catch (err) { next(err); }
}

// GET /api/listings/:id
export async function getListing(req, res, next) {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, ...visibleFilter(req) })
      .populate('seller', 'name email');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json({ listing });
  } catch (err) { next(err); }
}

// POST /api/listings
export async function createListing(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const listing = await Listing.create(value);
    res.status(201).json({ listing });
  } catch (err) { next(err); }
}

// PATCH /api/listings/:id — only active listings are editable (sold/removed are locked).
export async function updateListing(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $set: value },
      { new: true, runValidators: true }
    );
    if (!listing) return res.status(404).json({ message: 'Active listing not found' });
    res.json({ listing });
  } catch (err) { next(err); }
}

// PATCH /api/listings/:id/sold — no body, no Joi: the only change allowed is active -> sold.
export async function markSold(req, res, next) {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $set: { status: 'sold' } },
      { new: true }
    );
    if (!listing) return res.status(404).json({ message: 'Active listing not found' });
    res.json({ listing });
  } catch (err) { next(err); }
}

// DELETE /api/listings/:id — soft delete: keep the document, mark it removed.
export async function deleteListing(req, res, next) {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'removed' } },
      { $set: { status: 'removed' } },
      { new: true }
    );
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json({ listing });
  } catch (err) { next(err); }
}
