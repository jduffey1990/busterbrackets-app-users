import { Request, ResponseToolkit } from '@hapi/hapi';
import { AuthService } from '../controllers/authService'; 

export const homeRoutes = [
    {
        method: 'GET',
        path: '/',
        handler: (request: Request, h: ResponseToolkit) => {
            return 'Welcome to the restricted home page!';
        }
    }
];

export const loginRoutes = [
    {
        method: 'GET',
        path: '/login',
        handler: (request: Request, h: ResponseToolkit) => {
            return ` <html>
                            <head>
                                <title>Login page</title>
                            </head>
                            <body>
                                <h3>Please Log In</h3>
                                <form method="post" action="/login">
                                    Username: <input type="text" name="username"><br>
                                    Password: <input type="password" name="password"><br/>
                                <input type="submit" value="Login"></form>
                            </body>
                        </html>`;
        },
        options: {
            auth: false
        }
    },
    {
        method: 'POST',
        path: '/login',
        handler: async (request: Request, h: ResponseToolkit) => {
          const { username, password } = request.payload as { username: string; password: string };
    
          const { isValid, credentials, token } = await AuthService.validateUser(request, username, password, h);
          if (!isValid) {
            return h.response({ message: "Invalid credentials" }).code(401);
          }
    
          return h.response({ token }).code(200);
        },
        options: { auth: false } // Allow unauthenticated access for login
      },
];

