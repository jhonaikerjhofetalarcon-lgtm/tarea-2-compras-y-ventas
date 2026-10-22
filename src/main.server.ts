import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { DashboardComponent } from './app/features/dashboard/dashboard.component';
import { config } from './app/core/config/app.config.server';

const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(DashboardComponent, config, context);

export default bootstrap;
