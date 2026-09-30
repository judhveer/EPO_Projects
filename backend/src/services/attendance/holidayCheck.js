import { Op } from 'sequelize';
import models from '../../models/index.js';

const { User, Holiday, HolidayApplicability } = models;

// A holiday applies to an employee if ANY of its applicability rows
// matches them — ALL matches everyone, OFFICE/DEPARTMENT match on the
// employee's own value, INDIVIDUAL matches their exact User.id. A
// Holiday with zero applicability rows naturally matches nobody
// (the JOIN below simply returns nothing) — no special-casing needed.
export async function isHolidayForEmployee(employeeId, dateOnlyString) {
  const employee = await User.findByPk(employeeId, { attributes: ['id', 'office', 'department'] });
  if (!employee) return false;

  const holiday = await Holiday.findOne({
    where: { date: dateOnlyString, active: true },
    include: [{
      model: HolidayApplicability,
      as: 'applicability',
      required: true,
      where: {
        [Op.or]: [
          { scope_type: 'ALL' },
          { scope_type: 'OFFICE', scope_ref_id: employee.office },
          { scope_type: 'DEPARTMENT', scope_ref_id: employee.department },
          { scope_type: 'INDIVIDUAL', scope_ref_id: employee.id },
        ],
      },
    }],
  });

  return !!holiday;
}

// Richer variant — returns the actual Holiday row (name, type) rather
// than a boolean, for anywhere that needs to SHOW which holiday a day
// corresponds to (the attendance table, the future resolution engine).
export async function getHolidayForEmployee(employeeId, dateOnlyString) {
  const employee = await User.findByPk(employeeId, { attributes: ['id', 'office', 'department'] });
  if (!employee) return null;

  return Holiday.findOne({
    where: { date: dateOnlyString, active: true },
    include: [{
      model: HolidayApplicability,
      as: 'applicability',
      required: true,
      where: {
        [Op.or]: [
          { scope_type: 'ALL' },
          { scope_type: 'OFFICE', scope_ref_id: employee.office },
          { scope_type: 'DEPARTMENT', scope_ref_id: employee.department },
          { scope_type: 'INDIVIDUAL', scope_ref_id: employee.id },
        ],
      },
    }],
  });
}