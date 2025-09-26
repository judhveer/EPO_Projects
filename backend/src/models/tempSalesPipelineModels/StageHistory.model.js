import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const StageHistory = sequelize.define('StageHistory', {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    ticketId: {
      type: DataTypes.STRING(64),
      field: 'ticket_id'
    },
    fromStage: {
      type: DataTypes.STRING(24),
      field: 'from_stage'
    },
    toStage: {
      type: DataTypes.STRING(24),
      field: 'to_stage'
    },
    notes: {
      type: DataTypes.TEXT
    },
    by: {
      type: DataTypes.STRING(128),
    }
  }, {
    tableName: 'stage_history',
    underscored: true
  });
  return StageHistory;
};
