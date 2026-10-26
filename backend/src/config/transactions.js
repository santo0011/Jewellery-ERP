import mongoose from 'mongoose';
import { getContext } from '../core/context/requestContext.js';

/*
 * While a transaction is open (withTransaction), every query and save joins it — also code that passes no
 * session, or passes `{ session }` while it is undefined. Without this, a function written to run on its own
 * (a status change, an audit entry) would write outside the transaction when an Undo calls it, and survive a
 * rollback. Imported before any model is compiled (app.js, db.js).
 */
const QUERY_OPS = ['countDocuments', 'deleteMany', 'deleteOne', 'distinct', 'find', 'findOne', 'findOneAndDelete', 'findOneAndReplace', 'findOneAndUpdate', 'replaceOne', 'updateMany', 'updateOne'];

const open = () => getContext()?.txSession ?? null;

function joinOpenTransaction(schema) {
  schema.pre(QUERY_OPS, function joinQuery() {
    const session = open();
    if (session && this.options.session == null) this.session(session);
  });
  schema.pre('aggregate', function joinAggregate() {
    const session = open();
    if (session && this.options.session == null) this.session(session);
  });
  schema.pre('save', function joinSave() {
    const session = open();
    if (session && this.$session() == null) this.$session(session);
  });
}

mongoose.set('transactionAsyncLocalStorage', true);
mongoose.plugin(joinOpenTransaction);
