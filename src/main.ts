import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/core/config/app.config';
import { DashboardComponent } from './app/features/dashboard/dashboard.component';

bootstrapApplication(DashboardComponent, appConfig).catch((err) => console.error(err));
