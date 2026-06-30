package com.menugate.app.model;

import jakarta.persistence.*;
import lombok.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "MENUS")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Menu {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "menu_seq")
    @SequenceGenerator(name = "menu_seq", sequenceName = "MENU_SEQ", allocationSize = 1)
    @Column(name = "menu_id")
    private Long menuId;

    @Column(name = "title", length = 255, nullable = false)
    private String title;

    @Column(name = "category", length = 255)
    private String category;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_email", nullable = false)
    @ToString.Exclude
    private User owner;

    @OneToMany(mappedBy = "menu", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<MenuItem> items = new ArrayList<>();
}
