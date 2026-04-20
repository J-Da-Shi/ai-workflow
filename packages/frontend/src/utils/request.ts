import axios from 'axios';
import { isTokenExpired } from './auth';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');                                                                                                       
    if (token) {                                                                                                                                       
      if (isTokenExpired()) {                                                                                                                          
        localStorage.removeItem('token');                                                                                                              
        window.location.href = '/login';                                                                                                               
        return Promise.reject(new Error('token expired'));                                                                                             
      }                                                                                                                                                
      config.headers.Authorization = `Bearer ${token}`;                                                                                                
    } 
    return config;
  },
  (error) => Promise.reject(error),
);

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    if(status === 401) {
      localStorage.removeItem('token');
      // window.location.href = '/login';
      console.log('账号/密码错误')
    }
    const message = error.response?.data?.message || error.message;
    console.error('请求错误:', message);
    return Promise.reject(error);
  },
);

export default request;
