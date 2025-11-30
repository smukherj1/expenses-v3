import { Routes } from '@angular/router';
import { Home } from './route/home/home';
import { Manage } from './route/manage/manage';

export const routes: Routes = [
    {
        path: '',
        component: Home,
    },
    {
        path: 'manage',
        component: Manage,
    },
];
