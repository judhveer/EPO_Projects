const STAGE_LABEL = {
    RESEARCH: 'Research',
    APPROVAL: 'Sales Coordinator Approval',
    TELECALL: 'Tele-call Scheduling',
    MEETING: 'Meeting Outcome',
    CRM: 'CRM Follow-up',
    CLOSED: 'Closed'
};


const STAGE_NEXT_HINT = {
    RESEARCH: 'A researcher must submit the Research form first.',
    APPROVAL: 'A Sales Coordinator must review the research and move it to Tele-call.',
    TELECALL: 'A Telecaller must schedule the meeting and move it to Meeting.',
    MEETING: 'A Sales Executive must record the meeting outcome.',
    CRM: 'The CRM team must follow up or close this ticket.',
    CLOSED: 'This ticket is closed; no further actions are allowed.'
};


export function stageMismatch({ ticketId = '', expected, current }) {
    const expectedHuman = STAGE_LABEL[expected] || expected;
    const currentHuman = STAGE_LABEL[current] || current;

    const err = new Error(
        `This ticket isn’t ready for this step yet.`
    );
    err.status = 409;
    err.code = 'STAGE_MISMATCH';
    err.expose = true;
    err.details = {
        ticketId,
        currentStage: current,
        currentStageLabel: currentHuman,
        expectedStage: expected,
        expectedStageLabel: expectedHuman,
        message: `Ticket ${ticketId || ''} is currently at “${currentHuman}”. This page is for “${expectedHuman}”.`,
        guidance: STAGE_NEXT_HINT[current] || 'Please follow the pipeline order.',
        note: 'If you believe this is assigned to you by mistake, contact the Sales Coordinator.'
    };
    return err;
}



export default function errorHandler(err, req, res, next) {
    console.error('[error]', err);
    res.status(err.status || 500).json({
        error: err.message || 'Server error'
    });
}
