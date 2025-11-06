import api from './api';

// Job Card Endpoints
export const getJobCards = async (params = {}) => {
    const res = await api.get('/api/fms/jobcards', { params });
    return res.data;
};

export const getJobCardById = async (job_no) => {
    const res = await api.get(`/api/fms/jobcards/${job_no}`);
    return res.data;
};

export const createJobCard = async (payload) => {
    const res = await api.post('/api/fms/jobcards', payload);
    return res.data;
};

export const updateJobCard = async (job_no, payload) => {
    const res = await api.put(`/api/fms/jobcards/${job_no}`, payload);
    return res.data;
}

export const deleteJobCard = async (job_no) => {
    const res = await api.delete(`/api/fms/jobcards/${job_no}`);
    return res.data;
}


// Job Items
export const getJobItems = async (job_no) => {
    const res = await api.get(`api/fms/jobitems/${job_no}`);
    return res.data;
};

export const createJobItem = async (payload) => {
    const res = await api.post(`/api/fms/jobitems`, payload);
    return res.data;
}