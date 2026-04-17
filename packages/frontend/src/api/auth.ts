import request from '../utils/request';                                                                                                              
                                                                                                                                                       
// 注册                                                                                                                                              
// 对应后端 POST /auth/register                                                                                                                      
export function register(data: {                                                                                                                     
  email: string;
  password: string;                                                                                                                                  
  nickname: string;
}) {                                                                                                                                                 
  return request.post('/auth/register', data);
}                                                                                                                                                    
                                                                                                                                                      
// 登录                                                                                                                                              
// 对应后端 POST /auth/login                                                                                                                         
// 返回 { access_token: string, user: {...} }                                                                                                        
export function login(data: { email: string; password: string }) {                                                                                   
  return request.post('/auth/login', data);                                                                                                          
} 