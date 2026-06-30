package com.menugate.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MenuResponse {

    private Long menuId;
    private String title;
    private String category;
    private String ownerEmail;
    private List<MenuItemResponse> items;
}
