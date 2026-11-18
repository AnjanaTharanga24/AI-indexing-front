import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  sidebarCollapsed = false;
  mobileOpen = false;
  showProfile = false;
  username = '';
  initials = '';

  constructor(private keycloak: KeycloakService) {
    this.keycloak.loadUserProfile().then(profile => {
      this.username = profile.username || '';
      this.initials = this.username
        .split(/[\s._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map(s => s[0].toUpperCase())
        .join('') || 'U';
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobile() {
    this.mobileOpen = !this.mobileOpen;
  }

  closeMobile() {
    this.mobileOpen = false;
  }

  @HostListener('document:click')
  onDocClick() {
    this.showProfile = false;
  }

  logout() {
    this.keycloak.logout(window.location.origin);
  }
}
