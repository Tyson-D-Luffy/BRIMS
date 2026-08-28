import axios from 'axios';
import { auth } from '../firebase';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add the JWT token to every request
api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('brims_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // Fallback to Firebase ID token if custom JWT is not present
      const user = auth.currentUser;
      if (user) {
        const fbToken = await user.getIdToken();
        config.headers.Authorization = `Bearer ${fbToken}`;
      }
    }

    const selectedBranch = localStorage.getItem('brims_selected_branch');
    if (selectedBranch) {
      config.headers['x-selected-branch'] = selectedBranch;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If we get a 401 and haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          console.log('API Request failed with 401. Attempting silent re-auth...');
          const idToken = await firebaseUser.getIdToken(true); // Force refresh Firebase token
          
          // Use axios directly to avoid interceptor loop
          const response = await axios.post('/api/auth/login', { idToken });
          
          if (response.data.success) {
            const newToken = response.data.token;
            localStorage.setItem('brims_token', newToken);
            
            // Retry the original request with the new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        }
      } catch (authError: any) {
        console.error('Silent re-auth failed:', authError.message, authError.response?.data);
        // Continue to logout logic
      }
    }

    if (error.response?.status === 400) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || (error.response?.data?.details ? JSON.stringify(error.response.data.details) : 'Bad request');
      console.warn(`[API 400 Error]: ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} -> ${errorMsg}`, error.response?.data);
      if (error.response.data?.details && Array.isArray(error.response.data.details)) {
        console.warn('Validation details:', error.response.data.details);
      }
    }

    if (error.response?.status === 401) {
      const message = error.response?.data?.message;
      const code = error.response?.data?.code;
      console.warn(`401 Unauthorized: ${message} (${code || 'no code'}) - logging out`);
      
      try {
        auth.signOut();
      } catch (e) {
        console.error('Error signing out on 401:', e);
      }
      localStorage.removeItem('brims_token');
      localStorage.removeItem('brims_auth_method');
    }
    return Promise.reject(error);
  }
);

export default api;
