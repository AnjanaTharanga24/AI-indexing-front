import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard } from './core/auth/auth.guard';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { ProfileGeneratorComponent } from './pages/profile-generator/profile-generator.component';
import { ClassifyComponent } from './pages/classify/classify.component';
import { ProfilesComponent } from './pages/profiles/profiles.component';
import { ReviewComponent } from './pages/review/review.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'profile-generator', component: ProfileGeneratorComponent },
      { path: 'profiles', component: ProfilesComponent },
      { path: 'classify', component: ClassifyComponent },
      { path: 'review', component: ReviewComponent }
    ]
  }
];
