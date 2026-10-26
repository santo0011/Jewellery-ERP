import { updateOrganisationSchema } from '@jerp/shared/schemas';
import { requireContext } from '../../core/context/requestContext.js';
import { undoEdit } from '../undo/undo.helpers.js';
import { Organisation } from './organisation.model.js';
import { updateCurrentOrganisation } from './organisation.service.js';

export const organisationUndoHandlers = [
  undoEdit({
    type: 'organisation.update',
    title: 'Organisation details edited',
    permission: 'organisation.edit',
    schema: updateOrganisationSchema,
    // Always this organisation's own record (the stack is the organisation's).
    load: () => Organisation.findById(requireContext().organisationId).lean(),
    apply: (id, input) => updateCurrentOrganisation(input),
  }),
];
