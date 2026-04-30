import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDfVtCcpe0c5ZJnVIfyKvHkN-o1sVlmPxk",
  authDomain: "tekateka-f8aac.firebaseapp.com",
  projectId: "tekateka-f8aac",
  storageBucket: "tekateka-f8aac.firebasestorage.app",
  messagingSenderId: "696848531104",
  appId: "1:696848531104:web:4e4fe2d6ebdeb76a89d3c5",
  measurementId: "G-Z2D29HCV21"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
