import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import {
  FolderOff as NoProjectsIcon,
  PeopleOutline as NoMembersIcon,
  SearchOff as NoResultsIcon,
  InboxOutlined as EmptyInboxIcon,
} from '@mui/icons-material';

const iconMap = {
  projects: NoProjectsIcon,
  members: NoMembersIcon,
  search: NoResultsIcon,
  inbox: EmptyInboxIcon,
  default: NoProjectsIcon,
};

const EmptyState = ({
  type = 'default',
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  icon: CustomIcon,
}) => {
  const Icon = CustomIcon || iconMap[type] || iconMap.default;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          bgcolor: 'grey.100',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <Icon sx={{ fontSize: 40, color: 'grey.400' }} />
      </Box>

      <Typography variant="h6" gutterBottom color="text.secondary">
        {title}
      </Typography>

      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: 400 }}
        >
          {description}
        </Typography>
      )}

      {(actionLabel && (actionHref || onAction)) && (
        <Button
          variant="contained"
          href={actionHref}
          onClick={onAction}
          sx={{ mt: 1 }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
};

export default EmptyState;
